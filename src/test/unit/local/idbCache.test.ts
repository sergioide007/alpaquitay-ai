import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { CHUNK_BYTES, IdbModelCache } from '../../../local/webview/idbCache';

function fileResponse(bytes: Uint8Array, type = 'application/octet-stream', withLength = true): Response {
  // Deliver in 1 MB pieces, like a real network stream.
  let off = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (off >= bytes.length) { c.close(); return; }
      c.enqueue(bytes.slice(off, off + 1024 * 1024)); off += 1024 * 1024;
    },
  });
  return new Response(body, { headers: { 'Content-Type': type, ...(withLength ? { 'Content-Length': String(bytes.length) } : {}) } });
}

const pattern = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + 7) % 251);

describe('IdbModelCache', () => {
  let cache: IdbModelCache;
  beforeEach(() => { cache = new IdbModelCache(new IDBFactory()); });

  it('round-trips a multi-chunk file byte for byte and keeps its MIME type', async () => {
    const data = pattern(CHUNK_BYTES * 2 + 123_456);
    await cache.put('https://c/models/g/onnx/m.onnx', fileResponse(data));
    const hit = await cache.match('https://c/models/g/onnx/m.onnx');
    expect(hit?.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(hit?.headers.get('X-Alpaquitay-Cache')).toBe('idb');
    const back = new Uint8Array(await hit!.arrayBuffer());
    expect(back.length).toBe(data.length);
    expect(Buffer.compare(Buffer.from(back), Buffer.from(data))).toBe(0);
  });

  it('returns undefined for a missing key', async () => {
    expect(await cache.match('nope')).toBeUndefined();
  });

  it('never serves a download that failed half way, and cleans its chunks', async () => {
    let sent = 0;
    const broken = new Response(new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent >= 2) { c.error(new Error('network down')); return; }
        c.enqueue(pattern(CHUNK_BYTES)); sent++;
      },
    }), { headers: { 'Content-Length': String(CHUNK_BYTES * 5) } });
    await expect(cache.put('k', broken)).rejects.toThrow('network down');
    expect(await cache.match('k')).toBeUndefined();
    expect(await cache.keys()).toHaveLength(0);
  });

  it('rejects when fewer bytes arrive than Content-Length announced', async () => {
    const short = new Response(pattern(1000), { headers: { 'Content-Length': '5000' } });
    await expect(cache.put('short', short)).rejects.toThrow(/incompleta/);
    expect(await cache.match('short')).toBeUndefined();
  });

  it('overwrites an existing key', async () => {
    await cache.put('k', new Response('first'));
    await cache.put('k', new Response('second'));
    expect(await (await cache.match('k'))!.text()).toBe('second');
  });

  it('deleteByPrefix only removes that model and reports what it freed', async () => {
    await cache.put('https://c/models/a/x.json', new Response('1234'));
    await cache.put('https://c/models/a/y.json', new Response('12'));
    await cache.put('https://c/models/b/x.json', new Response('999'));
    expect(await cache.deleteByPrefix('https://c/models/a/')).toEqual({ files: 2, bytes: 6 });
    expect(await cache.match('https://c/models/a/x.json')).toBeUndefined();
    expect(await (await cache.match('https://c/models/b/x.json'))!.text()).toBe('999');
  });

  it('clear empties everything', async () => {
    await cache.put('a', new Response('x'));
    await cache.put('b', new Response('y'));
    expect((await cache.clear()).files).toBe(2);
    expect(await cache.keys()).toHaveLength(0);
  });

  it('does not reject a healthy download whose Content-Length is the ENCODED size (Content-Encoding present)', async () => {
    const data = pattern(5000);
    const res = new Response(data.slice().buffer as ArrayBuffer, { headers: { 'Content-Length': '1234', 'Content-Encoding': 'br', 'Content-Type': 'application/wasm' } });
    await expect(cache.put('encoded', res)).resolves.toBeUndefined();
    expect((await (await cache.match('encoded'))!.arrayBuffer()).byteLength).toBe(5000);
  });

  it('reports progress while storing', async () => {
    const seen: number[] = [];
    await cache.put('p', fileResponse(pattern(3 * 1024 * 1024)), (p) => seen.push(Math.round(p.progress)));
    expect(seen.at(-1)).toBe(100);
  });

  // Chromium hands `new Response(uint8Array)` over as ONE piece, and that is how transformers.js stores a model
  // after downloading it: a single 859 MB IndexedDB record hung the Webview in a real VS Code run.
  it('splits a body delivered as one huge piece into records of at most CHUNK_BYTES', async () => {
    const data = pattern(CHUNK_BYTES * 3 + 4321);
    const onePiece = new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close(); } }),
      { headers: { 'Content-Length': String(data.length) } });
    const factory = new IDBFactory();
    const c2 = new IdbModelCache(factory);
    await c2.put('big', onePiece);

    const db = await new Promise<IDBDatabase>((res, rej) => { const o = factory.open('alpaquitay-models', 1); o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); });
    const records = await new Promise<ArrayBuffer[]>((res, rej) => {
      const r = db.transaction('chunks', 'readonly').objectStore('chunks').getAll();
      r.onsuccess = () => res(r.result as ArrayBuffer[]); r.onerror = () => rej(r.error);
    });
    db.close();
    expect(records).toHaveLength(4);
    expect(Math.max(...records.map(b => b.byteLength))).toBe(CHUNK_BYTES);
    const back = new Uint8Array(await (await c2.match('big'))!.arrayBuffer());
    expect(Buffer.compare(Buffer.from(back), Buffer.from(data))).toBe(0);
  }, 30000);   // ~25 MiB through fake-indexeddb: over Jest's default 5 s on a loaded machine

  it('reports storage progress through onStore even when put() gets no callback (transformers.js case)', async () => {
    const seen: Array<[string, number, number]> = [];
    cache.onStore = (key, loaded, total) => seen.push([key, loaded, total]);
    const data = pattern(CHUNK_BYTES * 2 + 10);
    await cache.put('k', new Response(new ReadableStream<Uint8Array>({ start(c) { c.enqueue(data); c.close(); } }), { headers: { 'Content-Length': String(data.length) } }));
    expect(seen.length).toBeGreaterThanOrEqual(3);                     // one per full chunk, plus the tail
    expect(seen[0]).toEqual(['k', CHUNK_BYTES, data.length]);
    expect(seen.at(-1)).toEqual(['k', data.length, data.length]);
  });
});
