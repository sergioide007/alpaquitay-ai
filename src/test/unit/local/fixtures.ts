import { createHash } from 'crypto';
import { HASH_CHUNK_BYTES, type ModelManifest } from '../../../local/cdnPolicy';
import { generateSigningKey, signManifestBytes } from '../../../local/cdnTooling';
import type { LocalEngineSettings } from '../../../local/protocol';

export const sha = (b: Uint8Array | Buffer) => createHash('sha256').update(b).digest('hex');

/** Per-block hashes exactly like the stager computes them. */
export function blockHashes(bytes: Uint8Array, chunk = HASH_CHUNK_BYTES): string[] {
  const out: string[] = [];
  for (let off = 0; off < bytes.length; off += chunk) { out.push(sha(bytes.subarray(off, off + chunk))); }
  return out;
}

export function pattern(n: number, seed = 7): Uint8Array {
  return Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) % 251);
}

export function makeManifest(files: Record<string, Uint8Array> = { 'config.json': pattern(100), 'onnx/decoder_model_merged_q4.onnx': pattern(HASH_CHUNK_BYTES + 5000) }, over: Partial<ModelManifest> = {}): ModelManifest {
  return {
    schema: 2, id: 'gemma-4-e2b-it', label: 'Gemma 4 E2B (test)', revision: 'rev1', sequence: 100, chunkBytes: HASH_CHUNK_BYTES,
    license: 'apache-2.0',
    runtime: { dtypes: ['q4f16', 'q4'], requiresWebGpu: false, systemRole: 'native' },
    files: Object.entries(files).map(([path, bytes]) => ({ path, size: bytes.length, sha256: blockHashes(bytes) })),
    ...over,
  };
}

export function signed(manifest: ModelManifest) {
  const key = generateSigningKey();
  const bytes = Buffer.from(JSON.stringify(manifest));
  return { key, bytes, sig: signManifestBytes(bytes, key.privatePem) };
}

export const settings = (over: Partial<LocalEngineSettings> = {}): LocalEngineSettings => ({
  enabled: true, cdnBase: 'https://alpaquitay.specsolid.com', modelId: 'gemma-4-e2b-it', device: 'auto', dtype: 'auto', maxNewTokens: 512, extraTrustedKeys: [], ...over,
});

export class MemStore {
  data = new Map<string, unknown>();
  get<T>(k: string): T | undefined { return this.data.get(k) as T | undefined; }
  async update(k: string, v: unknown): Promise<void> { this.data.set(k, v); }
}

/** FetchBytes double that serves a signed manifest the way the CDN would. */
export function bytesServer(manifest: object, key = generateSigningKey()) {
  const bytes = Buffer.from(JSON.stringify(manifest));
  const sig = signManifestBytes(bytes, key.privatePem);
  const calls: string[] = [];
  const fetchBytes = jest.fn(async (url: string) => {
    calls.push(url);
    if (url.endsWith('manifest.json')) { return new Uint8Array(bytes); }
    if (url.endsWith('manifest.sig.json')) { return new Uint8Array(Buffer.from(JSON.stringify(sig))); }
    throw new Error(`HTTP 404 en ${url}`);
  });
  return { key, bytes, sig, fetchBytes, calls };
}
