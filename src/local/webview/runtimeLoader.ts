/**
 * Loads the ONNX Runtime glue (.mjs) and WebAssembly (.wasm) from the CDN, but only ever EXECUTES bytes
 * whose SHA-256 matches the hash pinned inside the extension bundle at build time. A compromised CDN
 * therefore cannot make the Webview run its code. Verified bytes are handed to ONNX Runtime as blob:
 * URLs, so the Webview CSP does not need to allow any remote script origin.
 *
 * (transformers.js can preload the runtime itself, but it swallows preload errors and then falls back to
 * importing the .mjs straight from the CDN: an integrity failure would silently become an unverified load.)
 */
import { runtimeFiles } from '../enginePolicy';
import { IntegrityError, sha256Hex, verifyRuntimeAsset, type Digest, type RuntimePins } from '../integrity';
import type { IdbModelCache } from './idbCache';

export interface LoadedRuntime { mjs: string; wasm: string; dispose(): void }

const MIME: Record<string, string> = { mjs: 'text/javascript', wasm: 'application/wasm' };
type RuntimeCache = Pick<IdbModelCache, 'match' | 'put' | 'delete'>;

async function loadOne(url: string, name: string, pins: RuntimePins, cache: RuntimeCache, fetchImpl: typeof fetch, digest: Digest): Promise<Uint8Array> {
  const type = MIME[name.split('.').pop()!];
  const cached = await cache.match(url).catch(() => undefined);
  if (cached) {
    const bytes = new Uint8Array(await cached.arrayBuffer());
    try { await verifyRuntimeAsset(name, bytes, pins, digest); return bytes; }
    catch { await cache.delete(url).catch(() => undefined); }   // corrupted entry: fall through to a fresh download
  }
  const res = await fetchImpl(url, { cache: 'no-store' });
  if (!res.ok) { throw new Error(`No se pudo descargar ${name}: HTTP ${res.status}`); }
  const bytes = new Uint8Array(await res.arrayBuffer());
  await verifyRuntimeAsset(name, bytes, pins, digest);        // throws IntegrityError: nothing is cached or run
  await cache.put(url, new Response(bytes.slice().buffer as ArrayBuffer, { headers: { 'Content-Type': type } })).catch(() => undefined);
  return bytes;
}

export async function loadVerifiedRuntime(
  cdnBase: string, ortVersion: string, device: 'webgpu' | 'wasm', pins: RuntimePins, cache: RuntimeCache,
  fetchImpl: typeof fetch = fetch, digest: Digest = sha256Hex,
): Promise<LoadedRuntime> {
  if (pins.version !== ortVersion) {
    throw new IntegrityError(`El runtime del bundle (${ortVersion}) no coincide con el fijado en la extension (${pins.version}).`);
  }
  const urls = runtimeFiles(cdnBase, ortVersion, device);
  const nameOf = (u: string) => u.split('/').pop()!;
  const [mjs, wasm] = await Promise.all([
    loadOne(urls.mjs, nameOf(urls.mjs), pins, cache, fetchImpl, digest),
    loadOne(urls.wasm, nameOf(urls.wasm), pins, cache, fetchImpl, digest),
  ]);
  const blobs = [
    URL.createObjectURL(new Blob([mjs.slice().buffer as ArrayBuffer], { type: MIME.mjs })),
    URL.createObjectURL(new Blob([wasm.slice().buffer as ArrayBuffer], { type: MIME.wasm })),
  ];
  return { mjs: blobs[0], wasm: blobs[1], dispose: () => blobs.forEach(u => URL.revokeObjectURL(u)) };
}
