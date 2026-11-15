import * as vscode from 'vscode';
import { isValidModelId, normalizeCdnBase, type ManifestSummary, type ModelManifest } from './cdnPolicy';
import { assertPromptSize, isPanelMemoryError, panelMemoryErrorMessage } from './enginePolicy';
import { resolveTrustedManifest, type TrustStore } from './manifestTrust';
import { fetchBytesIdentity, type FetchBytes } from './safeHttp';
import { PROJECT_PUBLIC_KEYS } from './trustedKeys';
import type { EngineMessage, EngineToHost, HostToEngine, LocalEngineSettings } from './protocol';

export type ProgressCallback = (stage: string, pct: number) => void;

export interface GenerateInput {
  messages: EngineMessage[];
  maxNewTokens?: number;
  temperature?: number;
  /**
   * Inactivity window: the request fails only if the engine sends NO progress for this long (default 5 minutes).
   * Every progress message (download bytes, load stages, each streamed token) restarts it, so a slow CPU or a slow
   * connection that keeps advancing is never cut off. MAX_REQUEST_MS still bounds the whole request.
   */
  timeoutMs?: number;
}

export interface GenerateResult { text: string; device: 'webgpu' | 'wasm'; newTokens: number }

/** What the rest of the extension depends on; lets tests replace the Webview. */
export interface ProbeResult { webgpu: boolean; shaderF16: boolean; cached: boolean; manifest: ManifestSummary; gpuReason?: string }

export interface LocalEngineApi {
  probe(s: LocalEngineSettings): Promise<ProbeResult>;
  generate(s: LocalEngineSettings, input: GenerateInput, onProgress?: ProgressCallback, token?: vscode.CancellationToken): Promise<GenerateResult>;
  clearCache(s: LocalEngineSettings): Promise<{ files: number; bytes: number }>;
}

interface Pending {
  resolve(v: EngineToHost): void;
  reject(e: Error): void;
  onProgress?: ProgressCallback;
}

const READY_TIMEOUT_MS = 20_000;
/** No progress at all for this long = the engine is stuck (download, load and each token all report progress). */
export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60_000;
/** Absolute ceiling for one request, progressing or not (an 800 MB download on a slow link plus CPU generation). */
export const MAX_REQUEST_MS = 60 * 60_000;

function nonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Pure so it can be unit-tested: the CSP is what keeps the engine inside the CDN allow-list. */
export function buildEngineHtml(opts: { cspSource: string; scriptUri: string; cdnBase: string; nonce: string }): string {
  const cdn = normalizeCdnBase(opts.cdnBase);
  const csp = [
    `default-src 'none'`,
    // No remote script origin: the ONNX Runtime is loaded from hash-verified blob: URLs only.
    `script-src ${opts.cspSource} blob: 'wasm-unsafe-eval'`,
    `connect-src ${cdn} blob: data:`,
    `worker-src blob:`,
    `style-src 'nonce-${opts.nonce}'`,
    `img-src data:`,
  ].join('; ');
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style nonce="${opts.nonce}">
body{font:13px var(--vscode-font-family);color:var(--vscode-foreground);padding:16px}
.track{height:6px;background:var(--vscode-progressBar-background);opacity:.25;margin-top:10px}
#bar{height:6px;width:0;background:var(--vscode-progressBar-background);transition:width .2s}
p{color:var(--vscode-descriptionForeground)}
</style></head>
<body>
<strong>Alpaquitay · motor local (WebGPU / Wasm)</strong>
<p>Esta pestaña ejecuta el modelo en tu equipo. Puedes dejarla en segundo plano; no la cierres durante una generación.</p>
<div id="status">Iniciando…</div><div class="track"><div id="bar"></div></div>
<script src="${opts.scriptUri}"></script>
</body></html>`;
}

export class LocalEngineHost implements LocalEngineApi, vscode.Disposable {
  private panel?: vscode.WebviewPanel;
  private panelCdn?: string;
  private ready?: Promise<void>;
  private readonly pending = new Map<string, Pending>();
  private seq = 0;

  private manifestCache?: { key: string; at: number; manifest: ModelManifest; summary: ManifestSummary };

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly store: TrustStore,
    private readonly fetchBytes: FetchBytes = fetchBytesIdentity,
    private readonly trustedKeys: readonly string[] = PROJECT_PUBLIC_KEYS,
  ) {}

  /** Signature + rollback verified here, in the extension host; the Webview only ever sees verified data. */
  private async manifestFor(s: LocalEngineSettings): Promise<{ manifest: ModelManifest; summary: ManifestSummary }> {
    const key = `${s.cdnBase}|${s.modelId}`;
    if (this.manifestCache && this.manifestCache.key === key && Date.now() - this.manifestCache.at < 5 * 60_000) { return this.manifestCache; }
    const keys = [...this.trustedKeys, ...s.extraTrustedKeys];
    const r = await resolveTrustedManifest({ fetchBytes: this.fetchBytes, cdnBase: s.cdnBase, modelId: s.modelId, trustedKeys: keys, store: this.store });
    this.manifestCache = { key, at: Date.now(), ...r };
    return r;
  }

  private validate(s: LocalEngineSettings): LocalEngineSettings {
    if (!isValidModelId(s.modelId)) { throw new Error(`localEngine.modelId invalido: "${s.modelId}"`); }
    return { ...s, cdnBase: normalizeCdnBase(s.cdnBase) };
  }

  private ensurePanel(cdnBase: string): Promise<void> {
    if (this.panel && this.panelCdn === cdnBase && this.ready) { return this.ready; }
    this.panel?.dispose();

    const panel = vscode.window.createWebviewPanel(
      'alpaquitayLocalEngine', 'Alpaquitay · Motor local',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'dist')] },
    );
    this.panel = panel;
    this.panelCdn = cdnBase;

    let onReady!: () => void;
    let onFail!: (e: Error) => void;
    const ready = new Promise<void>((res, rej) => { onReady = res; onFail = rej; });
    const timer = setTimeout(() => onFail(new Error('El motor local no respondio a tiempo (¿falta dist/engine-webview.js?).')), READY_TIMEOUT_MS);
    this.ready = ready.finally(() => clearTimeout(timer));
    this.ready.catch(() => { /* surfaced to the caller of ensurePanel */ });

    panel.webview.onDidReceiveMessage((m: EngineToHost) => {
      if (m.type === 'ready') { onReady(); return; }
      const p = this.pending.get(m.id);
      if (!p) { return; }
      if (m.type === 'progress') { p.onProgress?.(m.stage, m.pct); return; }
      this.pending.delete(m.id);
      if (m.type === 'error') { p.reject(new Error(m.message)); } else { p.resolve(m); }
    });

    panel.onDidDispose(() => {
      if (this.panel === panel) { this.panel = undefined; this.ready = undefined; }
      onFail(new Error('El panel del motor local se cerro.'));
      for (const [id, p] of this.pending) { p.reject(new Error('El panel del motor local se cerro.')); this.pending.delete(id); }
    });

    const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'engine-webview.js')).toString();
    panel.webview.html = buildEngineHtml({ cspSource: panel.webview.cspSource, scriptUri, cdnBase, nonce: nonce() });
    return this.ready;
  }

  private async request<T extends EngineToHost>(
    cdnBase: string,
    build: (id: string) => HostToEngine,
    expect: T['type'],
    opts: { onProgress?: ProgressCallback; token?: vscode.CancellationToken; timeoutMs?: number } = {},
  ): Promise<T> {
    await this.ensurePanel(cdnBase);
    const id = `r${++this.seq}`;
    return new Promise<T>((resolve, reject) => {
      const idleMs = opts.timeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
      const finish = () => { clearTimeout(idle); clearTimeout(ceiling); sub?.dispose(); };
      const fail = (e: Error) => { finish(); this.pending.delete(id); void this.panel?.webview.postMessage({ type: 'cancel', id } satisfies HostToEngine); reject(e); };
      const onIdle = () => fail(new Error(`El motor local dejo de responder (${Math.round(idleMs / 60_000)} min sin avance).`));
      let idle = setTimeout(onIdle, idleMs);
      const ceiling = setTimeout(() => fail(new Error(`Tiempo maximo agotado en el motor local (${Math.round(MAX_REQUEST_MS / 60_000)} min).`)), Math.max(idleMs, MAX_REQUEST_MS));
      const sub = opts.token?.onCancellationRequested(() => fail(new Error('Cancelado por el usuario.')));
      this.pending.set(id, {
        onProgress: (stage, pct) => { clearTimeout(idle); idle = setTimeout(onIdle, idleMs); opts.onProgress?.(stage, pct); },
        reject: (e) => { finish(); reject(e); },
        resolve: (m) => {
          finish();
          if (m.type !== expect) { reject(new Error(`Respuesta inesperada del motor: ${m.type}`)); } else { resolve(m as T); }
        },
      });
      void this.panel!.webview.postMessage(build(id));
    });
  }

  async probe(settings: LocalEngineSettings): Promise<ProbeResult> {
    const s = this.validate(settings);
    const { manifest, summary } = await this.manifestFor(s);
    const r = await this.request<Extract<EngineToHost, { type: 'probe-result' }>>(
      s.cdnBase, id => ({ type: 'probe', id, cdnBase: s.cdnBase, modelId: s.modelId, device: s.device, dtype: s.dtype, manifest }), 'probe-result', { timeoutMs: 30_000 });
    // The reason is shown to the user verbatim: keep only a short string from the Webview.
    const gpuReason = typeof r.gpuReason === 'string' && r.gpuReason ? r.gpuReason.slice(0, 400) : undefined;
    return { webgpu: r.webgpu, shaderF16: r.shaderF16, cached: r.cached, manifest: summary, ...(gpuReason ? { gpuReason } : {}) };
  }

  async generate(settings: LocalEngineSettings, input: GenerateInput, onProgress?: ProgressCallback, token?: vscode.CancellationToken): Promise<GenerateResult> {
    const s = this.validate(settings);
    assertPromptSize(input.messages);
    const { manifest } = await this.manifestFor(s);
    const run = () => this.request<Extract<EngineToHost, { type: 'done' }>>(
      s.cdnBase,
      id => ({
        type: 'generate', id, cdnBase: s.cdnBase, modelId: s.modelId, device: s.device, dtype: s.dtype, manifest,
        messages: input.messages,
        maxNewTokens: Math.max(16, Math.min(input.maxNewTokens ?? s.maxNewTokens, s.maxNewTokens)),
        temperature: input.temperature ?? 0.3,
      }),
      'done', { onProgress, token, timeoutMs: input.timeoutMs });
    let r: Extract<EngineToHost, { type: 'done' }>;
    try {
      r = await run();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!isPanelMemoryError(msg) || token?.isCancellationRequested) { throw err; }
      // The panel ran out of memory while creating the session (first run: download + cache writes + load in one
      // process). A new panel is a new process with a clean heap; files already stored in the cache are not downloaded again. Retry once.
      this.dispose();
      onProgress?.('Memoria agotada al cargar el modelo: reintentando en un panel nuevo (lo ya guardado no se descarga otra vez)', 95);
      try { r = await run(); } catch (err2) {
        const msg2 = err2 instanceof Error ? err2.message : String(err2);
        throw isPanelMemoryError(msg2) ? new Error(panelMemoryErrorMessage(msg2)) : err2;
      }
    }
    return { text: r.text, device: r.device, newTokens: r.newTokens };
  }

  async clearCache(settings: LocalEngineSettings): Promise<{ files: number; bytes: number }> {
    const s = this.validate(settings);
    const r = await this.request<Extract<EngineToHost, { type: 'cache-cleared' }>>(
      s.cdnBase, id => ({ type: 'clear-cache', id }), 'cache-cleared', { timeoutMs: 60_000 });
    return { files: r.files, bytes: r.bytes };
  }

  dispose(): void {
    this.panel?.dispose();
    this.panel = undefined;
    this.ready = undefined;
  }
}
