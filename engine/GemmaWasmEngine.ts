import { pipeline, env, InterruptableStoppingCriteria, type TextGenerationPipeline } from '@huggingface/transformers';
import { IdbModelCache } from '../src/local/webview/idbCache';
import { loadVerifiedRuntime, type LoadedRuntime } from '../src/local/webview/runtimeLoader';
import {
  checkStorageBudget, chooseDevice, foldSystemMessages, friendlyStorageError, pickDtype,
  ProgressAggregator, SerialQueue, stripThinking,
} from '../src/local/enginePolicy';
import { createVerifyingFetch, type RuntimePins } from '../src/local/integrity';
import { totalBytes } from '../src/local/cdnPolicy';
import type { EngineMessage, EngineTarget } from '../src/local/protocol';

/** Injected by scripts/build-engine.js from the exact onnxruntime-web files that were bundled. */
declare const __RUNTIME_PINS__: RuntimePins;

export type ProgressFn = (stage: string, pct: number) => void;

const READY_PREFIX = 'alpaquitay:ready:';

/**
 * Singleton inference engine, running inside the extension's Webview (the only place VS Code exposes
 * WebGPU). It trusts exactly two things: the manifest the extension host verified, and the runtime
 * hashes pinned in this bundle. Anything else coming from the CDN is hashed against those or refused.
 */
export class GemmaWasmEngine {
  private static inst?: GemmaWasmEngine;
  static get(): GemmaWasmEngine { return (this.inst ??= new GemmaWasmEngine()); }

  readonly cache = new IdbModelCache();
  private gen?: TextGenerationPipeline;
  private runtime?: LoadedRuntime;
  private loadedKey?: string;
  private loading?: Promise<void>;
  private device: 'webgpu' | 'wasm' = 'wasm';
  private stopper = new InterruptableStoppingCriteria();
  private readonly queue = new SerialQueue();

  private constructor() {}

  static async gpuInfo(): Promise<{ webgpu: boolean; shaderF16: boolean }> {
    try {
      const gpu = (navigator as unknown as { gpu?: { requestAdapter(): Promise<{ features: { has(f: string): boolean } } | null> } }).gpu;
      const adapter = gpu ? await gpu.requestAdapter() : null;
      return adapter ? { webgpu: true, shaderF16: adapter.features.has('shader-f16') } : { webgpu: false, shaderF16: false };
    } catch { return { webgpu: false, shaderF16: false }; }
  }

  private prefix(t: EngineTarget): string { return `${t.cdnBase}/models/${t.modelId}/`; }
  private marker(t: EngineTarget): string { return READY_PREFIX + this.prefix(t); }

  async isModelCached(t: EngineTarget): Promise<boolean> {
    const hit = await this.cache.match(this.marker(t)).catch(() => undefined);
    return !!hit && (await hit.text()) === t.manifest.revision;
  }

  private async syncRevision(t: EngineTarget): Promise<void> {
    const hit = await this.cache.match(this.marker(t));
    const stored = hit ? await hit.text() : undefined;
    if (stored !== undefined && stored !== t.manifest.revision) {
      await this.cache.deleteByPrefix(this.prefix(t));       // old weights are useless and take GBs
      await this.cache.delete(this.marker(t));
    }
  }

  async init(t: EngineTarget, onProgress?: ProgressFn): Promise<void> {
    const key = `${t.cdnBase}|${t.modelId}|${t.manifest.revision}|${t.device}|${t.dtype}`;
    if (this.gen && this.loadedKey === key) { return; }
    if (this.loading && this.loadedKey === key) { return this.loading; }
    this.loadedKey = key;
    this.gen = undefined;
    this.loading = this.load(t, onProgress).catch((err) => { this.loadedKey = undefined; throw friendlyStorageError(err); });
    return this.loading;
  }

  private async load(t: EngineTarget, onProgress?: ProgressFn): Promise<void> {
    onProgress?.('Comprobando cache local', 1);
    await this.cache.keys(this.marker(t));                    // opens IndexedDB: fails here, with a clear error, if unavailable
    await this.syncRevision(t);

    const gpu = await GemmaWasmEngine.gpuInfo();
    this.device = chooseDevice(t.device, gpu.webgpu);
    if (t.manifest.runtime.requiresWebGpu && this.device !== 'webgpu') {
      throw new Error('Este modelo requiere WebGPU y no esta disponible aqui: en Wasm (CPU, un solo hilo) seria inutilizable de lento.');
    }
    const dtype = pickDtype(t.manifest.runtime.dtypes, this.device, gpu.shaderF16, t.dtype);

    if (!(await this.isModelCached(t))) {
      const est = await navigator.storage?.estimate?.().catch(() => undefined);
      const problem = est ? checkStorageBudget(est, totalBytes(t.manifest)) : undefined;
      if (problem) { throw new Error(problem); }
    }

    // Every byte of model data goes through the verifying fetch; anything unlisted or altered is refused.
    const files = new Map(t.manifest.files.map(f => [f.path, f] as const));
    env.allowLocalModels = false;
    env.allowRemoteModels = true;
    env.remoteHost = `${t.cdnBase}/`;
    env.remotePathTemplate = 'models/{model}/';
    env.useBrowserCache = false;
    env.useCustomCache = true;
    env.customCache = this.cache as unknown as typeof env.customCache;
    env.useWasmCache = false;                                 // we hand ONNX Runtime verified blob: URLs below
    env.fetch = createVerifyingFetch(globalThis.fetch.bind(globalThis), { cdnBase: t.cdnBase, modelId: t.modelId, files }) as unknown as typeof env.fetch;

    const ort = env.backends.onnx;
    const version = ort.versions?.web;
    if (!version) { throw new Error('No se pudo determinar la version de onnxruntime-web.'); }
    onProgress?.('Verificando runtime ONNX', 2);
    this.runtime?.dispose();
    this.runtime = await loadVerifiedRuntime(t.cdnBase, version, this.device, __RUNTIME_PINS__, this.cache);
    if (ort.wasm) {
      ort.wasm.wasmPaths = { mjs: this.runtime.mjs, wasm: this.runtime.wasm } as unknown as typeof ort.wasm.wasmPaths;
      ort.wasm.proxy = false;
      if (!self.crossOriginIsolated) { ort.wasm.numThreads = 1; }   // no SharedArrayBuffer in Webviews
    }

    const agg = new ProgressAggregator();
    const generator = await pipeline('text-generation', t.modelId, {
      device: this.device,
      dtype,
      progress_callback: (e: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (e.status === 'progress' && e.file && e.total) {
          const pct = agg.update(e.file, e.loaded ?? 0, e.total);
          onProgress?.(`Descargando ${e.file.split('/').pop()}`, Math.max(3, Math.min(95, pct)));
        } else if (e.status === 'ready') {
          onProgress?.(`Modelo listo (${this.device}, ${dtype})`, 96);
        }
      },
    });
    this.gen = generator as TextGenerationPipeline;
    await this.cache.put(this.marker(t), new Response(t.manifest.revision, { headers: { 'Content-Type': 'text/plain' } }));
  }

  get activeDevice(): 'webgpu' | 'wasm' { return this.device; }

  /** Cancels this request only: a queued one is dropped, the running one is interrupted. */
  cancel(id: string): void {
    if (this.queue.cancel(id) === 'active') { this.stopper.interrupt(); }
  }

  generate(
    id: string,
    t: EngineTarget,
    messages: EngineMessage[],
    opts: { maxNewTokens: number; temperature: number },
    onProgress?: ProgressFn,
  ): Promise<{ text: string; newTokens: number }> {
    return this.queue.run(id, async () => {
      await this.init(t, onProgress);
      this.stopper.reset();
      onProgress?.('Generando', 97);
      const prompt = t.manifest.runtime.systemRole === 'fold' ? foldSystemMessages(messages) : messages;
      const sampling = opts.temperature > 0;
      const s = t.manifest.runtime.sampling;
      const out = await this.gen!(prompt, {
        max_new_tokens: opts.maxNewTokens,
        do_sample: sampling,
        ...(sampling ? { temperature: opts.temperature, ...(s?.topP !== undefined ? { top_p: s.topP } : {}), ...(s?.topK !== undefined ? { top_k: s.topK } : {}) } : {}),
        stopping_criteria: this.stopper,
      }) as Array<{ generated_text: Array<{ role: string; content: string }> }>;
      const reply = stripThinking(out[0]?.generated_text?.at(-1)?.content ?? '');
      return { text: reply, newTokens: Math.max(1, Math.round(reply.length / 4)) };
    });
  }

  async clearCache(): Promise<{ files: number; bytes: number }> {
    this.gen = undefined;
    this.loadedKey = undefined;
    this.loading = undefined;
    this.runtime?.dispose();
    this.runtime = undefined;
    return this.cache.clear();
  }
}
