import { IntegrityError } from '../../../local/integrity';
import { loadVerifiedRuntime } from '../../../local/webview/runtimeLoader';
import { sha } from './fixtures';

const MJS = new TextEncoder().encode('export default function init(){}');
const WASM = new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]);
const VER = '1.31.0-test';
const pins = { version: VER, files: {
  'ort-wasm-simd-threaded.asyncify.mjs': sha(MJS), 'ort-wasm-simd-threaded.asyncify.wasm': sha(WASM),
  'ort-wasm-simd-threaded.mjs': sha(MJS), 'ort-wasm-simd-threaded.wasm': sha(WASM),
} };
const BASE = 'https://cdn.example';

class FakeCache {
  map = new Map<string, Uint8Array>(); puts = 0;
  async match(k: string) { const v = this.map.get(k); return v ? new Response(v.slice().buffer as ArrayBuffer) : undefined; }
  async put(k: string, r: Response) { this.puts++; this.map.set(k, new Uint8Array(await r.arrayBuffer())); }
  async delete(k: string) { return this.map.delete(k); }
}
const cdn = (evil = false) => jest.fn(async (url: string) => {
  const bytes = String(url).endsWith('.mjs') ? MJS : WASM;
  return new Response((evil ? new Uint8Array([...bytes, 1]) : bytes).slice().buffer as ArrayBuffer, { status: 200 });
}) as unknown as typeof fetch & jest.Mock;

describe('loadVerifiedRuntime', () => {
  it('downloads, verifies against the pins, caches and hands out blob: URLs', async () => {
    const cache = new FakeCache(); const f = cdn();
    const rt = await loadVerifiedRuntime(BASE, VER, 'webgpu', pins, cache as never, f);
    expect(rt.mjs).toMatch(/^blob:/); expect(rt.wasm).toMatch(/^blob:/);
    expect(f.mock.calls.map(c => c[0])).toEqual([`${BASE}/models/runtime/${VER}/ort-wasm-simd-threaded.asyncify.mjs`, `${BASE}/models/runtime/${VER}/ort-wasm-simd-threaded.asyncify.wasm`]);
    expect(cache.puts).toBe(2);
    rt.dispose();
  });

  it('serves the second load from the cache without touching the network', async () => {
    const cache = new FakeCache();
    (await loadVerifiedRuntime(BASE, VER, 'wasm', pins, cache as never, cdn())).dispose();
    const f = cdn();
    (await loadVerifiedRuntime(BASE, VER, 'wasm', pins, cache as never, f)).dispose();
    expect(f).not.toHaveBeenCalled();
  });

  it('refuses a tampered runtime: nothing is cached and no blob URL is created', async () => {
    const cache = new FakeCache(); const spy = jest.spyOn(URL, 'createObjectURL');
    await expect(loadVerifiedRuntime(BASE, VER, 'webgpu', pins, cache as never, cdn(true))).rejects.toThrow(IntegrityError);
    expect(cache.puts).toBe(0);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('drops a corrupted cache entry and re-downloads a good one', async () => {
    const cache = new FakeCache();
    cache.map.set(`${BASE}/models/runtime/${VER}/ort-wasm-simd-threaded.mjs`, new Uint8Array([9, 9, 9]));   // corrupted
    cache.map.set(`${BASE}/models/runtime/${VER}/ort-wasm-simd-threaded.wasm`, WASM);                         // healthy
    const f = cdn();
    (await loadVerifiedRuntime(BASE, VER, 'wasm', pins, cache as never, f)).dispose();
    expect(f.mock.calls.length).toBe(1);   // only the corrupted .mjs was fetched again
  });

  it('refuses a runtime version that differs from the one pinned in the extension', async () => {
    await expect(loadVerifiedRuntime(BASE, '9.9.9', 'wasm', pins, new FakeCache() as never, cdn())).rejects.toThrow(/no coincide con el fijado/);
  });
});
