/**
 * CDN contract for the local engine. Pure (no vscode, no DOM): shared by the
 * extension host, the Webview engine and the Cloudflare Worker, so the three sides
 * can never drift apart on paths, MIME types or CORS rules.
 */

export const DEFAULT_CDN_BASE = 'https://alpaquitay.specsolid.com';
/**
 * Default local model, chosen by measurement in a real VS Code on an Intel UHD gen-9 iGPU (2026-11-15): the only
 * code-specialised candidate that loads in the WebGPU runtime, ~3.3-4.1 tok/s, Apache-2.0. Keep package.json in sync.
 */
export const DEFAULT_LOCAL_MODEL_ID = 'qwen2.5-coder-1.5b-instruct';
/**
 * Ids that earlier releases and docs told people to put in `localEngine.modelId`. That setting lives in the user's
 * settings.json, so changing the package.json default never reaches anyone who already saved one: the Hub kept showing
 * (and running) the old model while the rest of the UI already said Qwen.
 */
export const LEGACY_LOCAL_MODEL_IDS: readonly string[] = ['gemma-4-e2b-it', 'gemma-3-1b-it'];
export const MODELS_PATH_PREFIX = '/models/';

/** Strict allow-list: anything not listed here is rejected with 415 by the Worker. */
export const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  wasm: 'application/wasm',
  onnx: 'application/octet-stream',
  onnx_data: 'application/octet-stream',
  model: 'application/octet-stream',
  json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  jinja: 'text/plain; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
};

const ALLOWED_ORIGINS: readonly RegExp[] = [
  /^https:\/\/alpaquitay\.specsolid\.com$/,
  /^https:\/\/alpaquitay-ai\.specsolid\.com$/,
  /^https:\/\/specsolid\.com$/,
  /^vscode-webview:\/\/[a-z0-9-]+$/i,
];

const SEGMENT = /^[A-Za-z0-9._-]+$/;

/** transformers.js rejects ids containing `--` or `..`; keep the same rule everywhere. */
export function isValidModelId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,95}$/.test(id) && !id.includes('--') && !id.includes('..');
}

export function extensionOf(pathname: string): string {
  const last = pathname.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  return dot > 0 ? last.slice(dot + 1).toLowerCase() : '';
}

export function mimeFor(pathname: string): string | undefined {
  return MIME_BY_EXTENSION[extensionOf(pathname)];
}

/** True only for `/models/<segment>/…` paths made of safe segments (no traversal, no empty parts). */
export function isSafeModelPath(pathname: string): boolean {
  if (pathname.length > 300 || !pathname.startsWith(MODELS_PATH_PREFIX)) { return false; }
  const segments = pathname.slice(MODELS_PATH_PREFIX.length).split('/');
  return segments.length >= 1
    && segments.every(s => SEGMENT.test(s) && s !== '.' && s !== '..' && !s.includes('..'));
}

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  return !!origin && ALLOWED_ORIGINS.some(rx => rx.test(origin));
}

export interface CdnHeaderInput {
  origin?: string | null;
  contentType?: string;
  etag?: string;
  contentRange?: string;
}

/** Headers for every Worker response (including errors and preflights). */
export function buildCdnHeaders(input: CdnHeaderInput = {}): Record<string, string> {
  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, If-None-Match',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, ETag, Accept-Ranges',
    'Vary': 'Origin',
    // COEP: require-corp makes every sub-resource opt in with CORP; the models are public.
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'Cross-Origin-Embedder-Policy': 'require-corp',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'X-Content-Type-Options': 'nosniff',
  };
  if (isAllowedOrigin(input.origin)) { h['Access-Control-Allow-Origin'] = input.origin as string; }
  if (input.contentType) { h['Content-Type'] = input.contentType; }
  if (input.etag) { h['ETag'] = input.etag; }
  if (input.contentRange) { h['Content-Range'] = input.contentRange; }
  return h;
}

export function cacheControlFor(pathname: string): string {
  // The manifest is the revalidation point; weights/runtime are content-addressed by folder.
  // no-transform: the signed bytes and the chunk hashes must reach the client untouched.
  return pathname.endsWith('/manifest.json') || pathname.endsWith('/manifest.sig.json')
    ? 'public, max-age=300, must-revalidate, no-transform'
    : 'public, max-age=31536000, immutable, no-transform';
}

// ── Edge cache (Cloudflare "Workers Cache") ──
//
// Only small, static files go through the cached entrypoint. Everything else keeps the exact byte-for-byte path it
// always had (R2 → Worker → client), because Workers Cache strips `Range` before calling the Worker and cannot store
// anything above Cloudflare's 512 MB cap (Free-plan limit, applied to every plan at launch).

/** Objects larger than this are never routed through the edge cache. Far below the 512 MB cap on purpose. */
export const EDGE_CACHE_MAX_BYTES = 128 * 1024 * 1024;
/** ONNX Runtime lives in a folder named after its version: its bytes never change under a given URL. */
export const EDGE_TTL_RUNTIME_SECONDS = 7 * 24 * 3600;
/**
 * Model files sit under FIXED paths (`/models/<id>/…`) and are overwritten in place when a revision is published, so
 * the edge copy must expire fast: a stale tokenizer next to a fresh signed manifest fails the hash check. The browser
 * keeps its one-year `immutable` header (see cacheControlFor); this value is edge-only and never reaches the client.
 */
export const EDGE_TTL_MODEL_SECONDS = 3600;

/**
 * Edge TTL in seconds, or `undefined` when the path must ALWAYS be served straight from R2:
 *  - manifests: the revalidation point, a stale copy next to freshly uploaded files breaks every client;
 *  - `.onnx_data`: the multi-GB weights, above the cache cap and the one file that depends on real `Range` support.
 */
export function edgeTtlFor(pathname: string): number | undefined {
  if (pathname.endsWith('/manifest.json') || pathname.endsWith('/manifest.sig.json')) { return undefined; }
  if (extensionOf(pathname) === 'onnx_data') { return undefined; }
  return pathname.startsWith(`${MODELS_PATH_PREFIX}runtime/`) ? EDGE_TTL_RUNTIME_SECONDS : EDGE_TTL_MODEL_SECONDS;
}

/** RFC 9110 weak comparison for `If-None-Match` (a list, `*`, or `W/"…"` entries). */
export function etagMatches(ifNoneMatch: string | null | undefined, etag: string | null | undefined): boolean {
  if (!ifNoneMatch || !etag) { return false; }
  const strip = (v: string) => v.trim().replace(/^W\//, '');
  const want = strip(etag);
  return ifNoneMatch.split(',').some(candidate => { const c = strip(candidate); return c === '*' || c === want; });
}

export function contentRangeHeader(range: { offset?: number; length?: number }, size: number): string | undefined {
  if (range.offset === undefined || range.length === undefined || range.length <= 0) { return undefined; }
  return `bytes ${range.offset}-${range.offset + range.length - 1}/${size}`;
}

export function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
}

/** True for any IPv4/IPv6 literal. `new URL()` already canonicalizes odd spellings (0177.0.0.1, 127.1, fullwidth digits). */
export function isIpLiteral(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.startsWith('[');
}

/**
 * https only (loopback http allowed for local mirrors); origin only, no path/query; and a DNS NAME, never
 * an IP literal: Node's October 2026 security release fixed three TLS bugs that only exist for IP-literal hosts.
 */
export function normalizeCdnBase(input: string): string {
  let url: URL;
  try { url = new URL(input.trim()); } catch { throw new Error(`URL de CDN invalida: "${input}"`); }
  const loopback = isLoopbackHost(url.hostname);
  if (!loopback && isIpLiteral(url.hostname)) {
    throw new Error('La CDN debe ser un nombre de dominio, no una direccion IP.');
  }
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error('La CDN debe usar https (solo localhost puede usar http).');
  }
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash || url.username || url.password) {
    throw new Error('La URL de la CDN debe ser solo el origen, por ejemplo https://alpaquitay.specsolid.com');
  }
  return url.origin;
}

// ── Model manifest (served at /models/<id>/manifest.json, signed in manifest.sig.json) ──

/** Size of the blocks that get a SHA-256 each. Fixed so the format has no knobs to get wrong. */
export const HASH_CHUNK_BYTES = 8 * 1024 * 1024;
/** Defence against a hostile or mistaken manifest: refuse absurd downloads before asking the user. */
export const MAX_MODEL_BYTES = 8 * 1024 ** 3;
export const MAX_FILE_BYTES = 4 * 1024 ** 3;
export const MAX_MANIFEST_FILES = 128;
export const MAX_MANIFEST_BYTES = 512 * 1024;

export const KNOWN_DTYPES = ['fp32', 'fp16', 'q8', 'q4', 'q4f16', 'int8', 'uint8', 'bnb4'] as const;
export type Dtype = typeof KNOWN_DTYPES[number];

export interface ManifestFile {
  path: string;
  size: number;
  /** One lowercase hex SHA-256 per HASH_CHUNK_BYTES block (the last block may be shorter). */
  sha256: string[];
}

export interface ManifestRuntime {
  /** Weight precisions published for this model. */
  dtypes: Dtype[];
  /** Models too big for single-thread Wasm must say so: failing fast beats a 20-minute crawl. */
  requiresWebGpu: boolean;
  /** Older Gemma templates have no system role (Gemma 2 rejects it, Gemma 3 folds it into the first user turn); Gemma 4 supports it natively per its model card. */
  systemRole: 'native' | 'fold';
  minRamBytes?: number;
  sampling?: { topP?: number; topK?: number };
}

export interface ModelManifest {
  schema: 2;
  id: string;
  label: string;
  /** Changes whenever any file changes; drives cache invalidation. */
  revision: string;
  /** Monotonic: a validly signed but OLDER manifest is a rollback and is refused. */
  sequence: number;
  chunkBytes: number;
  license?: string;
  runtime: ManifestRuntime;
  files: ManifestFile[];
}

const HEX64 = /^[0-9a-f]{64}$/;

export function expectedChunks(size: number, chunkBytes = HASH_CHUNK_BYTES): number {
  return Math.ceil(size / chunkBytes);
}

export function parseManifest(raw: unknown, expectedId?: string): ModelManifest {
  const m = raw as Partial<ModelManifest> | null;
  if (!m || typeof m !== 'object') { throw new Error('manifest.json invalido'); }
  if (m.schema !== 2) { throw new Error('manifest: se requiere schema 2 (con hashes); los manifiestos antiguos no se aceptan'); }
  if (typeof m.id !== 'string' || !isValidModelId(m.id)) { throw new Error('manifest: "id" invalido'); }
  if (expectedId && m.id !== expectedId) { throw new Error(`manifest: id "${m.id}" no coincide con "${expectedId}"`); }
  if (typeof m.revision !== 'string' || !m.revision) { throw new Error('manifest: falta "revision"'); }
  if (!Number.isInteger(m.sequence) || (m.sequence as number) < 0) { throw new Error('manifest: "sequence" debe ser un entero >= 0'); }
  if (m.chunkBytes !== HASH_CHUNK_BYTES) { throw new Error(`manifest: chunkBytes debe ser ${HASH_CHUNK_BYTES}`); }
  if (!Array.isArray(m.files) || m.files.length === 0) { throw new Error('manifest: "files" vacio'); }
  if (m.files.length > MAX_MANIFEST_FILES) { throw new Error(`manifest: demasiados archivos (max ${MAX_MANIFEST_FILES})`); }

  const rt = m.runtime as Partial<ManifestRuntime> | undefined;
  if (!rt || !Array.isArray(rt.dtypes) || rt.dtypes.length === 0 || rt.dtypes.some(d => !(KNOWN_DTYPES as readonly string[]).includes(d))) {
    throw new Error('manifest: runtime.dtypes invalido');
  }
  if (typeof rt.requiresWebGpu !== 'boolean') { throw new Error('manifest: runtime.requiresWebGpu invalido'); }
  if (rt.systemRole !== 'native' && rt.systemRole !== 'fold') { throw new Error('manifest: runtime.systemRole invalido'); }
  if (rt.minRamBytes !== undefined && (!Number.isFinite(rt.minRamBytes) || rt.minRamBytes < 0)) { throw new Error('manifest: runtime.minRamBytes invalido'); }

  const seen = new Set<string>();
  const files = m.files.map((f, i) => {
    const file = f as Partial<ManifestFile>;
    if (typeof file.path !== 'string' || file.path.split('/').some(seg => !SEGMENT.test(seg) || seg.includes('..'))) {
      throw new Error(`manifest: files[${i}].path invalido`);
    }
    if (seen.has(file.path)) { throw new Error(`manifest: ruta duplicada ${file.path}`); }
    seen.add(file.path);
    if (typeof file.size !== 'number' || !Number.isInteger(file.size) || file.size < 0 || file.size > MAX_FILE_BYTES) {
      throw new Error(`manifest: files[${i}].size invalido`);
    }
    if (!Array.isArray(file.sha256) || file.sha256.length !== expectedChunks(file.size) || file.sha256.some(h => typeof h !== 'string' || !HEX64.test(h))) {
      throw new Error(`manifest: files[${i}].sha256 debe tener ${expectedChunks(file.size)} hashes SHA-256 hex`);
    }
    return { path: file.path, size: file.size, sha256: [...file.sha256] };
  });

  const manifest: ModelManifest = {
    schema: 2, id: m.id, label: typeof m.label === 'string' ? m.label : m.id, revision: m.revision,
    sequence: m.sequence as number, chunkBytes: HASH_CHUNK_BYTES,
    license: typeof m.license === 'string' ? m.license : undefined,
    runtime: {
      dtypes: [...rt.dtypes] as Dtype[], requiresWebGpu: rt.requiresWebGpu, systemRole: rt.systemRole,
      minRamBytes: rt.minRamBytes,
      sampling: rt.sampling && typeof rt.sampling === 'object' ? { topP: numOrUndef(rt.sampling.topP), topK: numOrUndef(rt.sampling.topK) } : undefined,
    },
    files,
  };
  if (totalBytes(manifest) > MAX_MODEL_BYTES) { throw new Error(`manifest: el modelo supera el maximo permitido (${formatBytes(MAX_MODEL_BYTES)})`); }
  return manifest;
}

function numOrUndef(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export interface ManifestSummary {
  id: string; label: string; revision: string; license?: string;
  totalBytes: number; requiresWebGpu: boolean; minRamBytes?: number;
  source: 'network' | 'offline-copy';
}

export function summarize(m: ModelManifest, source: ManifestSummary['source']): ManifestSummary {
  return { id: m.id, label: m.label, revision: m.revision, license: m.license, totalBytes: totalBytes(m), requiresWebGpu: m.runtime.requiresWebGpu, minRamBytes: m.runtime.minRamBytes, source };
}

export function totalBytes(m: ModelManifest): number {
  return m.files.reduce((sum, f) => sum + f.size, 0);
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) { return `${Math.max(1, Math.round(n / 1024))} KB`; }
  if (n < 1024 ** 3) { return `${(n / 1024 ** 2).toFixed(0)} MB`; }
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function manifestUrl(cdnBase: string, modelId: string): string {
  return `${cdnBase}${MODELS_PATH_PREFIX}${modelId}/manifest.json`;
}

export function manifestSigUrl(cdnBase: string, modelId: string): string {
  return `${cdnBase}${MODELS_PATH_PREFIX}${modelId}/manifest.sig.json`;
}

function isOfficialCdn(cdnBase: string): boolean {
  try { return normalizeCdnBase(cdnBase) === normalizeCdnBase(DEFAULT_CDN_BASE); } catch { return false; }
}

/**
 * The model the engine really uses, and therefore the one every label must show. Empty -> default. A legacy id
 * on the official CDN -> default. A custom mirror keeps whatever the user configured, and an invalid id is left
 * untouched so the engine reports it instead of the typo being hidden.
 */
export function resolveLocalModelId(configured: string | undefined, cdnBase: string): string {
  const id = (configured ?? '').trim();
  if (!id) { return DEFAULT_LOCAL_MODEL_ID; }
  if (LEGACY_LOCAL_MODEL_IDS.includes(id) && isOfficialCdn(cdnBase)) { return DEFAULT_LOCAL_MODEL_ID; }
  return id;
}
