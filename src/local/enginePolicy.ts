import { formatBytes, type Dtype } from './cdnPolicy';
import { EngineMessage } from './protocol';

/** WebGPU only when the browser really exposes an adapter; never trust `navigator.gpu` alone. */
export function chooseDevice(requested: 'auto' | 'webgpu' | 'wasm', hasWebGpuAdapter: boolean): 'webgpu' | 'wasm' {
  if (requested === 'wasm') { return 'wasm'; }
  if (requested === 'webgpu') {
    if (!hasWebGpuAdapter) { throw new Error('WebGPU no esta disponible en este equipo. Usa device = "auto" o "wasm".'); }
    return 'webgpu';
  }
  return hasWebGpuAdapter ? 'webgpu' : 'wasm';
}

/**
 * Above this size a model is GPU-only, whatever its manifest says. Measured on an i7-10850H: gemma-3-1b-it q4
 * (839 MB) runs at 0.15 tok/s on single-thread Wasm (hours per spec) versus 5.4 tok/s on the Intel iGPU.
 */
export const CPU_MAX_MODEL_BYTES = 512 * 1024 ** 2;

/** True when running this model without WebGPU would be unusably slow: refuse up front instead of grinding for hours. */
export function gpuRequired(m: { requiresWebGpu: boolean; totalBytes: number }): boolean {
  return m.requiresWebGpu || m.totalBytes > CPU_MAX_MODEL_BYTES;
}

/** Renderer strings Chromium reports when it has fallen back to software rendering (no GPU process / GPU blocked). */
const SOFTWARE_RENDERER = /swiftshader|basic render driver|llvmpipe|software/i;

/**
 * Why WebGPU is missing, phrased for the user. The common case in VS Code is not the extension: after its GPU
 * process crashes a few times (e.g. D3D11 out-of-memory), Chromium drops the WHOLE app to software rendering
 * until VS Code is fully restarted, and every Webview then gets `requestAdapter() === null`.
 */
export function noWebGpuReason(info: { hasApi: boolean; webglRenderer: string | null }): string {
  if (!info.hasApi) { return 'este VS Code no expone la API navigator.gpu (actualiza VS Code).'; }
  if (!info.webglRenderer || SOFTWARE_RENDERER.test(info.webglRenderer)) {
    return 'VS Code esta en renderizado por software (su proceso GPU fallo o la aceleracion por hardware esta desactivada). '
      + 'Cierra TODAS las ventanas de VS Code y vuelve a abrirlo; "code --status" muestra el estado en "GPU Status".';
  }
  return `la GPU (${info.webglRenderer}) no concede un adaptador WebGPU (controlador o lista de bloqueo de Chromium); actualiza el controlador de video.`;
}

/**
 * ONNX Runtime files the engine needs from the CDN. WebGPU needs the *asyncify* build (native WebGPU EP,
 * exports webgpuInit; the old JSEP build fails with "webgpuInit is not a function"); plain Wasm uses the base build. The folder is the exact onnxruntime-web version bundled in
 * the Webview, so runtime and glue code can never mismatch.
 */
export function runtimeFiles(cdnBase: string, ortVersion: string, device: 'webgpu' | 'wasm'): { mjs: string; wasm: string } {
  const base = `${cdnBase}/models/runtime/${ortVersion}/ort-wasm-simd-threaded${device === 'webgpu' ? '.asyncify' : ''}`;
  return { mjs: `${base}.mjs`, wasm: `${base}.wasm` };
}

/** Templates without a native system role (Gemma 2 rejects it): fold it into the first user turn explicitly. */
export function foldSystemMessages(messages: EngineMessage[]): EngineMessage[] {
  const system = messages.filter(m => m.role === 'system').map(m => m.content.trim()).filter(Boolean).join('\n\n');
  const rest = messages.filter(m => m.role !== 'system');
  if (!system) { return rest; }
  const firstUser = rest.findIndex(m => m.role === 'user');
  if (firstUser === -1) { return [{ role: 'user', content: system }, ...rest]; }
  return rest.map((m, i) => i === firstUser ? { role: 'user', content: `${system}\n\n${m.content}` } : m);
}

/** Collapses per-file download events into a single 0-100 percentage. */
export class ProgressAggregator {
  private readonly files = new Map<string, { loaded: number; total: number }>();

  update(file: string, loaded: number, total: number): number {
    this.files.set(file, { loaded, total: Math.max(total, loaded) });
    return this.percent();
  }

  percent(): number {
    let loaded = 0, total = 0;
    for (const f of this.files.values()) { loaded += f.loaded; total += f.total; }
    return total === 0 ? 0 : Math.min(100, Math.round((loaded / total) * 100));
  }
}

// ── Hardening helpers ─────────────────────────────────────────────────────────

/** ~4k tokens. Larger prompts risk exhausting GPU memory on small devices; fail early and say why. */
export const MAX_PROMPT_CHARS = 16_000;

export function assertPromptSize(messages: EngineMessage[], max: number = MAX_PROMPT_CHARS): void {
  const n = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (n > max) {
    throw new Error(`El texto es demasiado largo para el motor local (${n} caracteres; maximo ${max}). Selecciona un fragmento mas corto.`);
  }
}

const F16_DTYPES: readonly Dtype[] = ['fp16', 'q4f16'];
const PREFERENCE_NO_F16: readonly Dtype[] = ['q4', 'q8', 'int8', 'uint8', 'bnb4', 'fp32'];

/**
 * q4f16 is fastest on WebGPU but needs the `shader-f16` feature, and some Gemma exports overflow in
 * fp16 and emit garbage (onnxruntime#26732), so `q4` stays the safe default whenever f16 is in doubt.
 */
export function pickDtype(available: readonly Dtype[], device: 'webgpu' | 'wasm', shaderF16: boolean, requested: 'auto' | Dtype): Dtype {
  const f16Ok = device === 'webgpu' && shaderF16;
  if (requested !== 'auto') {
    if (!available.includes(requested)) { throw new Error(`El modelo no publica dtype "${requested}" (disponibles: ${available.join(', ')}).`); }
    if (F16_DTYPES.includes(requested) && !f16Ok) {
      throw new Error(`dtype "${requested}" requiere WebGPU con shader-f16; usa localEngine.dtype = "auto" o "q4".`);
    }
    return requested;
  }
  if (f16Ok && available.includes('q4f16')) { return 'q4f16'; }
  const pick = PREFERENCE_NO_F16.find(d => available.includes(d));
  if (!pick) { throw new Error(`Este equipo no puede ejecutar ninguno de los dtype publicados (${available.join(', ')}): requieren shader-f16.`); }
  return pick;
}

/** Gemma 4 can emit a reasoning block; the spec must only contain the final answer. */
export function stripThinking(text: string): string {
  return text.replace(/<\|channel>thought[\s\S]*?<channel\|>/g, '').trim();
}

export type CancelOutcome = 'active' | 'queued' | 'none';
class Cancelled extends Error { constructor() { super('Cancelado por el usuario.'); } }

/**
 * One inference at a time: ONNX Runtime WebGPU sessions are not re-entrant, so two overlapping
 * requests (command + Hub chat, or a double click) would corrupt each other. Cancelling a queued
 * request removes only that one; cancelling the active one is the caller's job (interrupt the model).
 */
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private activeId?: string;
  private readonly waiting = new Map<string, { cancelled: boolean }>();

  run<T>(id: string, task: () => Promise<T>): Promise<T> {
    const state = { cancelled: false };
    this.waiting.set(id, state);
    const result = this.tail.then(async () => {
      this.waiting.delete(id);
      if (state.cancelled) { throw new Cancelled(); }
      this.activeId = id;
      try { return await task(); } finally { this.activeId = undefined; }
    });
    this.tail = result.catch(() => undefined);
    return result;
  }

  cancel(id: string): CancelOutcome {
    if (this.activeId === id) { return 'active'; }
    const state = this.waiting.get(id);
    if (state) { state.cancelled = true; return 'queued'; }
    return 'none';
  }
}

/** Fail BEFORE downloading gigabytes if the Webview origin cannot hold them (QuotaExceeded mid-download is the alternative). */
export function checkStorageBudget(estimate: { quota?: number; usage?: number }, neededBytes: number): string | undefined {
  if (estimate.quota === undefined) { return undefined; }
  const free = estimate.quota - (estimate.usage ?? 0);
  const needed = Math.ceil(neededBytes * 1.1);
  if (free < needed) {
    return `Espacio insuficiente para la cache del modelo: hacen falta ${formatBytes(needed)} y el Webview solo dispone de ${formatBytes(Math.max(0, free))}. Libera disco o usa un modelo mas pequeno.`;
  }
  return undefined;
}

export function friendlyStorageError(err: unknown): Error {
  const e = err as { name?: string; message?: string } | undefined;
  if (e?.name === 'QuotaExceededError') {
    return new Error('Se agoto el espacio de la cache del Webview mientras se guardaba el modelo. Libera disco y reintenta; la descarga parcial se elimino.');
  }
  return err instanceof Error ? err : new Error(String(err));
}

const GPU_MEMORY_ERROR = /CreateCommittedResource|OutOfMemory|out of memory|\bOOM\b|device (was )?lost|Device removed/i;

/**
 * ONNX Runtime surfaces GPU exhaustion as a long C++ trace ("failed to call OrtRun() ... buffer_manager.cc").
 * Say what happened and what to do; keep the first line of the original for support.
 */
export function friendlyInferenceError(err: unknown): Error {
  const raw = err instanceof Error ? err.message : String(err);
  // After a WebGPU device error ONNX Runtime may only surface its own cleanup failure ("reading 'destroy'"):
  // seen in a real VS Code run whose prefill hit CreateCommittedResource OutOfMemory.
  if (GPU_MEMORY_ERROR.test(raw) || /OrtRun\(\)|reading 'destroy'/.test(raw)) {
    const detail = raw.split('\n')[0].slice(0, 160);
    return new Error('La GPU se quedo sin memoria o fallo durante la generacion. Se libero el modelo: vuelve a intentarlo '
      + `con un texto mas corto o cerrando aplicaciones que usen la GPU. (Detalle: ${detail})`);
  }
  return err instanceof Error ? err : new Error(raw);
}

/** Human label for where inference runs; shown in progress so a slow CPU run is not mistaken for a hang. */
export function deviceLabel(device: 'webgpu' | 'wasm', crossOriginIsolated: boolean): string {
  if (device === 'webgpu') { return 'GPU'; }
  return crossOriginIsolated ? 'CPU' : 'CPU, 1 hilo';
}

/**
 * Counts streamed tokens and decides when to report: the first token, then at most once per `everyMs`.
 * Pure (time is passed in) so it is unit-tested without a model.
 */
export class TokenMeter {
  tokens = 0;
  private start?: number;
  private lastReport = -Infinity;

  constructor(private readonly maxNewTokens: number, private readonly everyMs = 1000) {}

  tick(now: number): { tokens: number; rate: string; pct: number } | undefined {
    this.tokens++;
    this.start ??= now;
    if (this.tokens > 1 && now - this.lastReport < this.everyMs) { return undefined; }
    this.lastReport = now;
    const secs = (now - this.start) / 1000;
    const rate = secs > 0 ? ((this.tokens - 1) / secs).toFixed(1) : '…';
    // Generation owns the 97..99 band of the overall progress bar (download and load use 0..96).
    const pct = 97 + Math.min(2, (2 * this.tokens) / Math.max(1, this.maxNewTokens));
    return { tokens: this.tokens, rate, pct };
  }
}
