import { HASH_CHUNK_BYTES } from '../../../local/cdnPolicy';
import { IntegrityError, createVerifyingFetch, sha256Hex, verifyRuntimeAsset, verifyingResponse } from '../../../local/integrity';
import { blockHashes, pattern, sha } from './fixtures';

const CHUNK = 1024;   // tiny blocks keep the tests fast; the logic is identical
const body = (bytes: Uint8Array, piece = 300) => {
  let off = 0;
  return new Response(new ReadableStream<Uint8Array>({
    pull(c) { if (off >= bytes.length) { c.close(); return; } c.enqueue(bytes.slice(off, off + piece)); off += piece; },
  }), { status: 200, headers: { 'Content-Length': String(bytes.length), 'Content-Encoding': 'gzip' } });
};
const entryFor = (bytes: Uint8Array, path = 'f.onnx') => ({ path, size: bytes.length, sha256: blockHashes(bytes, CHUNK) });
const drain = async (r: Response) => new Uint8Array(await r.arrayBuffer());

describe('verifyingResponse', () => {
  const data = pattern(CHUNK * 3 + 77);

  it('passes verified bytes through unchanged (including a short last block) and reports the real size', async () => {
    const res = verifyingResponse(body(data), entryFor(data), sha256Hex, CHUNK);
    expect(res.headers.get('Content-Length')).toBe(String(data.length));
    expect(res.headers.get('Content-Encoding')).toBeNull();     // the wire encoding must not leak into size checks
    expect(Buffer.compare(Buffer.from(await drain(res)), Buffer.from(data))).toBe(0);
  });

  it('handles upstream pieces that are smaller and larger than a block (no stream stall)', async () => {
    for (const piece of [1, 17, CHUNK, CHUNK * 2 + 3, 100000]) {
      const out = await drain(verifyingResponse(body(data, piece), entryFor(data), sha256Hex, CHUNK));
      expect(out.length).toBe(data.length);
    }
  });

  it('rejects a single flipped byte in the middle block', async () => {
    const bad = data.slice(); bad[CHUNK + 10] ^= 0xff;
    await expect(drain(verifyingResponse(body(bad), entryFor(data), sha256Hex, CHUNK))).rejects.toThrow(/bloque 1 no coincide/);
  });

  it('rejects a flipped byte in the short last block', async () => {
    const bad = data.slice(); bad[data.length - 1] ^= 1;
    await expect(drain(verifyingResponse(body(bad), entryFor(data), sha256Hex, CHUNK))).rejects.toThrow(/bloque 3 no coincide/);
  });

  it('rejects a truncated body', async () => {
    await expect(drain(verifyingResponse(body(data.slice(0, CHUNK * 2)), entryFor(data), sha256Hex, CHUNK))).rejects.toThrow(/tamano|faltan/);
  });

  it('rejects trailing bytes beyond the manifest size', async () => {
    const longer = new Uint8Array(data.length + 10); longer.set(data);
    await expect(drain(verifyingResponse(body(longer), entryFor(data), sha256Hex, CHUNK))).rejects.toThrow(/mas bytes/);
  });

  it('never delivers a block before its hash matched', async () => {
    const bad = data.slice(); bad[0] ^= 1;
    const reader = verifyingResponse(body(bad), entryFor(data), sha256Hex, CHUNK).body!.getReader();
    await expect(reader.read()).rejects.toThrow(IntegrityError);
  });

  it('handles an empty file', async () => {
    const empty = new Uint8Array(0);
    expect((await drain(verifyingResponse(body(empty), entryFor(empty), sha256Hex, CHUNK))).length).toBe(0);
  });
});

describe('createVerifyingFetch (the env.fetch the engine installs)', () => {
  const files = new Map([['config.json', { path: 'config.json', size: 5, sha256: [sha(Buffer.from('hello'))] }]]);
  const opts = { cdnBase: 'https://cdn.example', modelId: 'm', files };
  const P = 'https://cdn.example/models/m/';
  const ok = (text: string) => (async () => new Response(text, { status: 200 })) as typeof fetch;

  it('verifies a listed file', async () => {
    expect(await (await createVerifyingFetch(ok('hello'), opts)(P + 'config.json')).text()).toBe('hello');
  });
  it('refuses tampered content', async () => {
    await expect((await createVerifyingFetch(ok('HELLO'), opts)(P + 'config.json')).text()).rejects.toThrow(IntegrityError);
  });
  it('refuses a 200 for a path that is not in the signed manifest', async () => {
    await expect(createVerifyingFetch(ok('evil'), opts)(P + 'extra.json')).rejects.toThrow(/no listado/);
  });
  it('refuses any URL outside the model prefix (fails closed)', async () => {
    const f = createVerifyingFetch(ok('x'), opts);
    await expect(f('https://huggingface.co/m/resolve/main/config.json')).rejects.toThrow(/fuera del modelo/);
    await expect(f('https://cdn.example/models/other/config.json')).rejects.toThrow(/fuera del modelo/);
  });
  it('passes 404s through so optional files stay optional', async () => {
    const f = createVerifyingFetch((async () => new Response('', { status: 404 })) as typeof fetch, opts);
    expect((await f(P + 'special_tokens_map.json')).status).toBe(404);
  });
  it('passes HEAD / Range probes (size lookups) through without trusting their content', async () => {
    const f = createVerifyingFetch((async () => new Response('x', { status: 206 })) as typeof fetch, opts);
    expect((await f(P + 'anything.onnx_data', { headers: { Range: 'bytes=0-0' } })).status).toBe(206);
    expect((await f(P + 'anything.onnx_data', { method: 'HEAD' })).status).toBe(206);
  });
  it('strips a query string when matching the manifest path', async () => {
    expect(await (await createVerifyingFetch(ok('hello'), opts)(P + 'config.json?download=1')).text()).toBe('hello');
  });
});

describe('verifyRuntimeAsset (hash pinned in the bundle)', () => {
  const bytes = new TextEncoder().encode('export default 1;');
  const pins = { version: '1.0.0', files: { 'ort.mjs': sha(bytes) } };
  it('accepts the pinned bytes', async () => { await expect(verifyRuntimeAsset('ort.mjs', bytes, pins)).resolves.toBeUndefined(); });
  it('rejects different bytes', async () => { await expect(verifyRuntimeAsset('ort.mjs', new TextEncoder().encode('evil()'), pins)).rejects.toThrow(/hash fijado/); });
  it('rejects an unpinned file name', async () => { await expect(verifyRuntimeAsset('other.mjs', bytes, pins)).rejects.toThrow(/sin hash/); });
});

it('uses 8 MiB hash blocks in production', () => expect(HASH_CHUNK_BYTES).toBe(8 * 1024 * 1024));
