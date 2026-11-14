/**
 * Streaming integrity checks for downloaded model files. Browser-safe (Web Crypto only,
 * no Node imports) so the same code runs in the Webview and under Jest.
 *
 * Threat addressed: the CDN, its bucket or a network hop serves bytes that differ from
 * what the maintainer signed. Every 8 MiB block is hashed and compared BEFORE it is handed
 * to the cache or to ONNX Runtime; one wrong block aborts the whole download.
 */
import { HASH_CHUNK_BYTES, MODELS_PATH_PREFIX, expectedChunks, type ManifestFile } from './cdnPolicy';

export class IntegrityError extends Error {
  constructor(message: string) { super(message); this.name = 'IntegrityError'; }
}

export type Digest = (bytes: Uint8Array) => Promise<string>;

export const sha256Hex: Digest = async (bytes) => {
  const copy = bytes.slice().buffer as ArrayBuffer;  // subtle.digest wants a standalone ArrayBuffer
  const hash = await globalThis.crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Wraps a 200 response so that its body is verified block by block against `entry`.
 * The consumer receives a block only after its hash matched, and the stream errors with
 * IntegrityError on the first mismatch, a short body or trailing bytes.
 */
export function verifyingResponse(
  response: Response,
  entry: ManifestFile,
  digest: Digest = sha256Hex,
  chunkBytes: number = HASH_CHUNK_BYTES,
): Response {
  if (!response.body) { throw new IntegrityError(`${entry.path}: respuesta sin cuerpo`); }
  const reader = response.body.getReader();
  let block = new Uint8Array(chunkBytes);
  let filled = 0, index = 0, total = 0;

  const checkBlock = async (bytes: Uint8Array) => {
    const want = entry.sha256[index];
    if (want === undefined) { throw new IntegrityError(`${entry.path}: bloques de mas (esperados ${entry.sha256.length})`); }
    const got = await digest(bytes);
    if (got !== want) { throw new IntegrityError(`${entry.path}: el bloque ${index} no coincide con el manifiesto firmado`); }
    index++;
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        let enqueued = false;   // pull() must enqueue or close, otherwise the stream stalls
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            if (filled > 0) { const last = block.slice(0, filled); await checkBlock(last); controller.enqueue(last); filled = 0; }
            if (total !== entry.size) { throw new IntegrityError(`${entry.path}: tamano ${total} distinto del manifiesto (${entry.size})`); }
            if (index !== expectedChunks(entry.size, chunkBytes)) { throw new IntegrityError(`${entry.path}: faltan bloques`); }
            controller.close();
            return;
          }
          total += value.length;
          if (total > entry.size) { throw new IntegrityError(`${entry.path}: el servidor envio mas bytes que el manifiesto (${entry.size})`); }
          let offset = 0;
          while (offset < value.length) {
            const take = Math.min(chunkBytes - filled, value.length - offset);
            block.set(value.subarray(offset, offset + take), filled);
            filled += take; offset += take;
            if (filled === chunkBytes) {
              const full = block; block = new Uint8Array(chunkBytes); filled = 0;
              await checkBlock(full);
              controller.enqueue(full);
              enqueued = true;
            }
          }
          if (enqueued) { return; }   // otherwise keep reading until a full block is ready
        }
      } catch (err) {
        reader.cancel().catch(() => undefined);
        controller.error(err);
      }
    },
    cancel(reason) { return reader.cancel(reason); },
  });

  const headers = new Headers(response.headers);
  headers.set('Content-Length', String(entry.size));   // authoritative; the wire value may be the encoded size
  headers.delete('Content-Encoding');
  return new Response(body, { status: 200, headers });
}

export interface VerifyingFetchOptions {
  cdnBase: string;
  modelId: string;
  files: ReadonlyMap<string, ManifestFile>;
  digest?: Digest;
}

/**
 * Drop-in for `env.fetch`. Fails closed:
 *  - only URLs under `<cdn>/models/<id>/` may be fetched;
 *  - a 200 for a path that is not in the signed manifest is rejected;
 *  - full-body GETs are verified; HEAD / Range probes (size lookups) pass through untouched.
 */
export function createVerifyingFetch(baseFetch: typeof fetch, opts: VerifyingFetchOptions): typeof fetch {
  const prefix = `${opts.cdnBase}${MODELS_PATH_PREFIX}${opts.modelId}/`;
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : (input as Request).url;
    if (!url.startsWith(prefix)) { throw new IntegrityError(`URL fuera del modelo permitido: ${url}`); }
    const method = (init?.method ?? 'GET').toUpperCase();
    const headers = new Headers(init?.headers);
    const partial = method !== 'GET' || headers.has('Range');
    const res = await baseFetch(input, init);
    if (partial || res.status !== 200) { return res; }

    const rel = url.slice(prefix.length).split(/[?#]/)[0];
    const entry = opts.files.get(rel);
    if (!entry) {
      await res.body?.cancel().catch(() => undefined);
      throw new IntegrityError(`${rel}: archivo no listado en el manifiesto firmado`);
    }
    return verifyingResponse(res, entry, opts.digest);
  };
}

/** Runtime assets (ONNX Runtime .mjs/.wasm) are pinned by hash inside the extension bundle. */
export interface RuntimePins { version: string; files: Record<string, string> }

export async function verifyRuntimeAsset(name: string, bytes: Uint8Array, pins: RuntimePins, digest: Digest = sha256Hex): Promise<void> {
  const want = pins.files[name];
  if (!want) { throw new IntegrityError(`${name}: sin hash fijado en la extension`); }
  const got = await digest(bytes);
  if (got !== want) { throw new IntegrityError(`${name}: el runtime descargado no coincide con el hash fijado en la extension`); }
}
