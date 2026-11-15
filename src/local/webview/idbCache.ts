/**
 * IndexedDB cache for model files, shaped like transformers.js `env.customCache`.
 *
 * Files are stored in fixed-size chunks and served back as a lazy stream, so a
 * multi-hundred-MB .onnx never has to sit fully in memory. The meta record is written
 * LAST: a download that dies half way leaves chunks but no meta, so it is never served.
 */

import { friendlyStorageError } from '../enginePolicy';

export const CACHE_DB_NAME = 'alpaquitay-models';
const META = 'meta';
const CHUNKS = 'chunks';
export const CHUNK_BYTES = 8 * 1024 * 1024;

interface MetaRecord {
  key: string;
  type: string;
  size: number;
  chunks: number;
  storedAt: number;
}

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

const done = (t: IDBTransaction): Promise<void> =>
  new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });

const chunkKey = (key: string, i: number) => `${key}\u0000${String(i).padStart(6, '0')}`;

export class IdbModelCache {
  private dbPromise?: Promise<IDBDatabase>;

  /**
   * Called as each chunk is written, whoever called put(). transformers.js stores a downloaded model WITHOUT a
   * progress callback, and writing ~1 GB takes a while: the engine uses this to keep reporting progress.
   */
  onStore?: (key: string, loaded: number, total: number) => void;

  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private db(): Promise<IDBDatabase> {
    return (this.dbPromise ??= new Promise((res, rej) => {
      const open = this.factory.open(CACHE_DB_NAME, 1);
      open.onupgradeneeded = () => {
        open.result.createObjectStore(META, { keyPath: 'key' });
        open.result.createObjectStore(CHUNKS);
      };
      open.onsuccess = () => res(open.result);
      open.onerror = () => rej(open.error);
    }));
  }

  private async getMeta(key: string): Promise<MetaRecord | undefined> {
    const db = await this.db();
    return req<MetaRecord | undefined>(db.transaction(META, 'readonly').objectStore(META).get(key));
  }

  async match(key: string): Promise<Response | undefined> {
    const meta = await this.getMeta(key);
    if (!meta) { return undefined; }
    const db = await this.db();
    let next = 0;
    const body = new ReadableStream<Uint8Array>({
      pull: async (controller) => {
        if (next >= meta.chunks) { controller.close(); return; }
        const buf = await req<ArrayBuffer | undefined>(
          db.transaction(CHUNKS, 'readonly').objectStore(CHUNKS).get(chunkKey(key, next++)));
        if (!buf) { controller.error(new Error(`Cache corrupta: falta el fragmento ${next - 1} de ${key}`)); return; }
        controller.enqueue(new Uint8Array(buf));
      },
    });
    return new Response(body, {
      headers: { 'Content-Type': meta.type, 'Content-Length': String(meta.size), 'X-Alpaquitay-Cache': 'idb' },
    });
  }

  async put(
    key: string,
    response: Response,
    progress?: (p: { progress: number; loaded: number; total: number }) => void,
  ): Promise<void> {
    await this.delete(key);
    const total = Number(response.headers.get('Content-Length') ?? 0);
    // With Content-Encoding the header holds the ENCODED size while the stream yields decoded bytes:
    // comparing them would reject healthy downloads. Integrity is enforced upstream (hash + size).
    const strictLength = total > 0 && !response.headers.get('Content-Encoding');
    const type = response.headers.get('Content-Type') ?? 'application/octet-stream';
    let index = 0, size = 0, pending: Uint8Array[] = [], pendingBytes = 0;

    const flush = async () => {
      if (pendingBytes === 0) { return; }
      const merged = new Uint8Array(pendingBytes);
      let off = 0;
      for (const part of pending) { merged.set(part, off); off += part.length; }
      pending = []; pendingBytes = 0;
      const db = await this.db();
      const t = db.transaction(CHUNKS, 'readwrite');
      t.objectStore(CHUNKS).put(merged.buffer, chunkKey(key, index++));
      await done(t);
    };

    const report = () => {
      const p = { progress: total ? (size / total) * 100 : 0, loaded: size, total: total || size };
      progress?.(p);
      this.onStore?.(key, p.loaded, p.total);
    };
    // A stream may hand over the whole file as ONE piece: Chromium does so for `new Response(uint8Array)`,
    // which is exactly how transformers.js stores a model after downloading it. Never let a record grow past
    // CHUNK_BYTES: one 859 MB IndexedDB value (plus its copy) hung the Webview for good.
    const append = async (value: Uint8Array) => {
      for (let off = 0; off < value.length;) {
        const take = Math.min(CHUNK_BYTES - pendingBytes, value.length - off);
        pending.push(value.subarray(off, off + take)); pendingBytes += take; size += take; off += take;
        if (pendingBytes === CHUNK_BYTES) { await flush(); report(); }
      }
    };

    try {
      if (response.body) {
        const reader = response.body.getReader();
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end) { break; }
          await append(value);
          report();
        }
      } else {
        await append(new Uint8Array(await response.arrayBuffer()));
      }
      await flush();
      if (strictLength && size !== total) { throw new Error(`Descarga incompleta de ${key}: ${size} de ${total} bytes`); }
      const db = await this.db();
      const t = db.transaction(META, 'readwrite');
      t.objectStore(META).put({ key, type, size, chunks: index, storedAt: Date.now() } satisfies MetaRecord);
      await done(t);
    } catch (err) {
      await this.removeChunks(key, index + 1).catch(() => undefined);
      throw friendlyStorageError(err);
    }
  }

  async delete(key: string): Promise<boolean> {
    const meta = await this.getMeta(key);
    const db = await this.db();
    const t = db.transaction(META, 'readwrite');
    t.objectStore(META).delete(key);
    await done(t);
    if (meta) { await this.removeChunks(key, meta.chunks); }
    return !!meta;
  }

  private async removeChunks(key: string, count: number): Promise<void> {
    if (count <= 0) { return; }
    const db = await this.db();
    const t = db.transaction(CHUNKS, 'readwrite');
    for (let i = 0; i < count; i++) { t.objectStore(CHUNKS).delete(chunkKey(key, i)); }
    await done(t);
  }

  async keys(prefix = ''): Promise<MetaRecord[]> {
    const db = await this.db();
    const all = await req<MetaRecord[]>(db.transaction(META, 'readonly').objectStore(META).getAll());
    return all.filter(m => m.key.startsWith(prefix));
  }

  async deleteByPrefix(prefix: string): Promise<{ files: number; bytes: number }> {
    const metas = await this.keys(prefix);
    let bytes = 0;
    for (const m of metas) { bytes += m.size; await this.delete(m.key); }
    return { files: metas.length, bytes };
  }

  async clear(): Promise<{ files: number; bytes: number }> {
    return this.deleteByPrefix('');
  }
}
