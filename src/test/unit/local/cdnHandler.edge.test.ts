import { BucketLike, BucketObject, EdgeFetcher, handleCdnRequest, serveEdgeObject } from '../../../local/cdnHandler';
import {
  EDGE_CACHE_MAX_BYTES,
  EDGE_TTL_MODEL_SECONDS,
  EDGE_TTL_RUNTIME_SECONDS,
  edgeTtlFor,
  etagMatches,
} from '../../../local/cdnPolicy';

const bodyOf = (u: Uint8Array) => new Response(u as unknown as BodyInit).body;
const WEBVIEW_A = 'vscode-webview://aaaa1111';
const WEBVIEW_B = 'vscode-webview://bbbb2222';

function bucketWith(files: Record<string, Uint8Array>): BucketLike & { calls: string[]; cancelled: string[] } {
  const calls: string[] = [];
  const cancelled: string[] = [];
  return {
    calls,
    cancelled,
    async get(key, { range, onlyIf }): Promise<BucketObject | null> {
      calls.push(key);
      const data = files[key];
      if (!data) { return null; }
      const etag = `"etag-${data.length}"`;
      if (onlyIf.get('If-None-Match') === etag) { return { httpEtag: etag, size: data.length }; }
      const m = /^bytes=(\d+)-(\d+)$/.exec(range.get('Range') ?? '');
      if (m) {
        const offset = Number(m[1]); const end = Math.min(Number(m[2]), data.length - 1);
        return { httpEtag: etag, size: data.length, range: { offset, length: end - offset + 1 }, body: bodyOf(data.slice(offset, end + 1)) };
      }
      const stream = bodyOf(data) as ReadableStream;
      const origCancel = stream.cancel.bind(stream);
      stream.cancel = (reason?: unknown) => { cancelled.push(key); return origCancel(reason); };
      return { httpEtag: etag, size: data.length, body: stream };
    },
  };
}

const files = {
  'models/g/tokenizer.json': new TextEncoder().encode('{"tok":1}'),
  'models/g/onnx/m.onnx': new Uint8Array(1000).fill(7),
  'models/g/onnx/m.onnx_data': new Uint8Array(2000).fill(9),
  'models/g/manifest.json': new TextEncoder().encode('{"id":"g"}'),
  'models/runtime/1.0.0/ort.wasm': new Uint8Array([0, 0x61, 0x73, 0x6d]),
};
const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  new Request(`https://alpaquitay.specsolid.com${path}`, { method, headers });

/** Stands in for `ctx.exports.ModelsCache.fetch`: records what the gateway sent and runs the real cached-entrypoint body. */
function edgeOver(bucket: BucketLike, opts: { now?: number; fail?: boolean; override?: () => Response } = {}) {
  const seen: Request[] = [];
  const edge: EdgeFetcher = async (r) => {
    seen.push(r);
    if (opts.fail) { throw new Error('cache layer down'); }
    if (opts.override) { return opts.override(); }
    return serveEdgeObject(r, bucket, () => opts.now ?? 1234);
  };
  return { edge, seen };
}

describe('edgeTtlFor', () => {
  it('manifests and the multi-GB weights are never edge-cached', () => {
    expect(edgeTtlFor('/models/g/manifest.json')).toBeUndefined();
    expect(edgeTtlFor('/models/g/manifest.sig.json')).toBeUndefined();
    expect(edgeTtlFor('/models/g/onnx/model_q4f16.onnx_data')).toBeUndefined();
  });
  it('model files get a short edge TTL (fixed paths are overwritten in place)', () => {
    expect(edgeTtlFor('/models/g/tokenizer.json')).toBe(EDGE_TTL_MODEL_SECONDS);
    expect(edgeTtlFor('/models/g/onnx/model_q4f16.onnx')).toBe(EDGE_TTL_MODEL_SECONDS);
    expect(EDGE_TTL_MODEL_SECONDS).toBeLessThanOrEqual(3600);
  });
  it('the version-pinned ONNX Runtime gets a long edge TTL', () => {
    expect(edgeTtlFor('/models/runtime/1.30.0/ort-wasm-simd-threaded.wasm')).toBe(EDGE_TTL_RUNTIME_SECONDS);
  });
  it('stays far below Cloudflare\'s 512 MB cacheable-size cap', () => {
    expect(EDGE_CACHE_MAX_BYTES).toBeLessThan(512 * 1024 * 1024);
  });
});

describe('etagMatches', () => {
  it.each([
    ['"a"', '"a"', true],
    ['W/"a"', '"a"', true],
    ['"b", "a"', '"a"', true],
    ['*', '"a"', true],
    ['"b"', '"a"', false],
    ['', '"a"', false],
    [null, '"a"', false],
    ['"a"', undefined, false],
  ])('If-None-Match %p vs ETag %p -> %p', (inm, etag, want) => {
    expect(etagMatches(inm as string | null, etag as string | undefined)).toBe(want);
  });
});

describe('serveEdgeObject (body of the CACHED entrypoint)', () => {
  it('returns the whole object with an edge-only TTL and nothing tied to the caller', async () => {
    const res = await serveEdgeObject(get('/models/g/tokenizer.json', { Origin: WEBVIEW_A }), bucketWith(files), () => 42);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cloudflare-CDN-Cache-Control')).toBe(`max-age=${EDGE_TTL_MODEL_SECONDS}`);
    expect(res.headers.get('Cache-Control')).toContain('immutable');
    expect(res.headers.get('Content-Length')).toBe(String(files['models/g/tokenizer.json'].length));
    expect(res.headers.get('ETag')).toBeTruthy();
    expect(res.headers.get('X-Edge-Filled-At')).toBe('42');
    // One cache entry must be valid for EVERY origin: no CORS echo, no Vary, no Set-Cookie.
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Vary')).toBeNull();
    expect(res.headers.get('Set-Cookie')).toBeNull();
  });

  it('ignores Range and conditionals: it always answers with the full object', async () => {
    const b = bucketWith(files);
    const res = await serveEdgeObject(get('/models/g/onnx/m.onnx', { Range: 'bytes=0-9', 'If-None-Match': '"etag-1000"' }), b);
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(1000);
  });

  it('uses the long TTL for the version-pinned runtime', async () => {
    const res = await serveEdgeObject(get('/models/runtime/1.0.0/ort.wasm'), bucketWith(files));
    expect(res.headers.get('Cloudflare-CDN-Cache-Control')).toBe(`max-age=${EDGE_TTL_RUNTIME_SECONDS}`);
  });

  it.each(['/models/g/manifest.json', '/models/g/onnx/m.onnx_data', '/models/g/page.html', '/models/../x.json'])(
    'refuses %s without reading the bucket (no-store 404)', async (p) => {
      const b = bucketWith(files);
      const res = await serveEdgeObject(get(p), b);
      expect(res.status).toBe(404);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(b.calls).toHaveLength(0);
    });

  it('a missing object is a no-store 404, so it is never remembered', async () => {
    const res = await serveEdgeObject(get('/models/g/none.json'), bucketWith(files));
    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('an object above the cap is not cached and its stream is released', async () => {
    const big = { ...files, 'models/g/big.onnx': new Uint8Array(1) };
    const b = bucketWith(big);
    const realGet = b.get.bind(b);
    b.get = async (k, o) => { const obj = await realGet(k, o); return obj && k.endsWith('big.onnx') ? { ...obj, size: EDGE_CACHE_MAX_BYTES + 1 } : obj; };
    const res = await serveEdgeObject(get('/models/g/big.onnx'), b);
    expect(res.status).toBe(413);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(b.cancelled).toContain('models/g/big.onnx');
  });
});

describe('handleCdnRequest with the edge cache (gateway)', () => {
  it('answers a small file through the cached entrypoint with exactly one R2 read', async () => {
    const b = bucketWith(files);
    const { edge, seen } = edgeOver(b, { now: 777 });
    // The stand-in edge reads the bucket through serveEdgeObject: one read in total means the gateway did not read it too.
    const res = await handleCdnRequest(get('/models/g/tokenizer.json', { Origin: WEBVIEW_A }), b, edge);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('{"tok":1}');
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('X-Edge-Filled-At')).toBe('777');
    expect(res.headers.get('X-Edge-Cache')).toBe('EDGE');
    expect(seen).toHaveLength(1);
    expect(b.calls).toEqual(['models/g/tokenizer.json']);
  });

  it('keeps the full isolation/CORS contract per caller', async () => {
    const b = bucketWith(files);
    const res = await handleCdnRequest(get('/models/g/onnx/m.onnx', { Origin: WEBVIEW_A }), b, edgeOver(b).edge);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(WEBVIEW_A);
    expect(res.headers.get('Vary')).toBe('Origin');
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=31536000, immutable, no-transform');
    expect(res.headers.get('Accept-Ranges')).toBe('bytes');
    expect(res.headers.get('Content-Length')).toBe('1000');
    expect(res.headers.get('ETag')).toBe('"etag-1000"');
  });

  it('two Webviews with different origins share ONE cache key and never see each other\'s CORS header', async () => {
    const b = bucketWith(files);
    const { edge, seen } = edgeOver(b);
    const a = await handleCdnRequest(get('/models/g/tokenizer.json', { Origin: WEBVIEW_A }), b, edge);
    const c = await handleCdnRequest(get('/models/g/tokenizer.json', { Origin: WEBVIEW_B }), b, edge);
    expect(a.headers.get('Access-Control-Allow-Origin')).toBe(WEBVIEW_A);
    expect(c.headers.get('Access-Control-Allow-Origin')).toBe(WEBVIEW_B);
    expect(seen.map(r => r.url)).toEqual([seen[0].url, seen[0].url]);
    for (const r of seen) {
      expect(r.method).toBe('GET');
      expect(r.headers.get('Origin')).toBeNull();
      expect(r.headers.get('Range')).toBeNull();
      expect(r.headers.get('If-None-Match')).toBeNull();
    }
  });

  it('a foreign origin still gets no CORS grant through the edge path', async () => {
    const b = bucketWith(files);
    const res = await handleCdnRequest(get('/models/g/tokenizer.json', { Origin: 'https://evil.example.com' }), b, edgeOver(b).edge);
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('strips the query string from the cache key (no cache-busting fan-out)', async () => {
    const b = bucketWith(files);
    const { edge, seen } = edgeOver(b);
    await handleCdnRequest(get('/models/g/tokenizer.json?bust=1'), b, edge);
    await handleCdnRequest(get('/models/g/tokenizer.json?bust=2'), b, edge);
    expect(seen.map(r => new URL(r.url).search)).toEqual(['', '']);
    expect(new Set(seen.map(r => r.url)).size).toBe(1);
  });

  it('HEAD returns headers and no body, and releases the cached stream', async () => {
    const b = bucketWith(files);
    const res = await handleCdnRequest(get('/models/g/onnx/m.onnx', {}, 'HEAD'), b, edgeOver(b).edge);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(res.headers.get('Content-Length')).toBe('1000');
    expect(b.cancelled).toContain('models/g/onnx/m.onnx');
  });

  it('If-None-Match answers 304 from the edge ETag, still with the isolation headers', async () => {
    const b = bucketWith(files);
    const res = await handleCdnRequest(get('/models/g/onnx/m.onnx', { 'If-None-Match': '"etag-1000"', Origin: WEBVIEW_A }), b, edgeOver(b).edge);
    expect(res.status).toBe(304);
    expect(res.body).toBeNull();
    expect(res.headers.get('ETag')).toBe('"etag-1000"');
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(WEBVIEW_A);
  });

  it('shows Cloudflare\'s own cache status when it is visible to the gateway', async () => {
    const b = bucketWith(files);
    const override = () => new Response('x', { status: 200, headers: { 'Cf-Cache-Status': 'HIT', 'ETag': '"e"', 'X-Edge-Filled-At': '5' } });
    const res = await handleCdnRequest(get('/models/g/tokenizer.json'), b, edgeOver(b, { override }).edge);
    expect(res.headers.get('X-Edge-Cache')).toBe('HIT');
    expect(res.headers.get('X-Edge-Filled-At')).toBe('5');
  });

  describe('what must NEVER touch the edge', () => {
    it('a Range request is served by R2 as 206, exactly as before', async () => {
      const b = bucketWith(files);
      const { edge, seen } = edgeOver(b);
      const res = await handleCdnRequest(get('/models/g/onnx/m.onnx', { Range: 'bytes=100-299' }), b, edge);
      expect(res.status).toBe(206);
      expect(res.headers.get('Content-Range')).toBe('bytes 100-299/1000');
      expect((await res.arrayBuffer()).byteLength).toBe(200);
      expect(res.headers.get('X-Edge-Cache')).toBe('BYPASS');
      expect(seen).toHaveLength(0);
    });

    it('the multi-GB weights (.onnx_data) go straight to R2, ranges included', async () => {
      const b = bucketWith(files);
      const { edge, seen } = edgeOver(b);
      const full = await handleCdnRequest(get('/models/g/onnx/m.onnx_data'), b, edge);
      expect(full.status).toBe(200);
      expect(full.headers.get('X-Edge-Cache')).toBe('BYPASS');
      const part = await handleCdnRequest(get('/models/g/onnx/m.onnx_data', { Range: 'bytes=0-99' }), b, edge);
      expect(part.status).toBe(206);
      expect(part.headers.get('Content-Range')).toBe('bytes 0-99/2000');
      expect(seen).toHaveLength(0);
    });

    it('manifests always revalidate against R2', async () => {
      const b = bucketWith(files);
      const { edge, seen } = edgeOver(b);
      const res = await handleCdnRequest(get('/models/g/manifest.json'), b, edge);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toContain('must-revalidate');
      expect(res.headers.get('X-Edge-Cache')).toBe('BYPASS');
      expect(seen).toHaveLength(0);
    });

    it('preflight, 405, 415 and 404-by-path never reach the edge or the bucket', async () => {
      const b = bucketWith(files);
      const { edge, seen } = edgeOver(b);
      expect((await handleCdnRequest(get('/models/g/tokenizer.json', { Origin: WEBVIEW_A }, 'OPTIONS'), b, edge)).status).toBe(204);
      expect((await handleCdnRequest(get('/models/g/tokenizer.json', {}, 'POST'), b, edge)).status).toBe(405);
      expect((await handleCdnRequest(get('/models/g/page.html'), b, edge)).status).toBe(415);
      expect((await handleCdnRequest(get('/other/x.json'), b, edge)).status).toBe(404);
      expect(seen).toHaveLength(0);
      expect(b.calls).toHaveLength(0);
    });
  });

  describe('the cache layer can never take the CDN down', () => {
    it('falls back to R2 when the cached entrypoint throws', async () => {
      const b = bucketWith(files);
      const res = await handleCdnRequest(get('/models/g/tokenizer.json'), b, edgeOver(b, { fail: true }).edge);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('{"tok":1}');
      expect(res.headers.get('X-Edge-Cache')).toBe('BYPASS');
    });

    it('falls back to R2 when the cached entrypoint answers anything but 200', async () => {
      const b = bucketWith(files);
      const override = () => new Response(null, { status: 503 });
      const res = await handleCdnRequest(get('/models/g/tokenizer.json'), b, edgeOver(b, { override }).edge);
      expect(res.status).toBe(200);
      expect(res.headers.get('X-Edge-Cache')).toBe('BYPASS');
    });

    it('a missing object is still a clean 404 with isolation headers', async () => {
      const b = bucketWith(files);
      const res = await handleCdnRequest(get('/models/g/none.json', { Origin: WEBVIEW_A }), b, edgeOver(b).edge);
      expect(res.status).toBe(404);
      expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe(WEBVIEW_A);
    });
  });

  it('without an edge fetcher the handler behaves exactly as before (no diagnostic headers)', async () => {
    const res = await handleCdnRequest(get('/models/g/tokenizer.json'), bucketWith(files));
    expect(res.status).toBe(200);
    expect(res.headers.get('X-Edge-Cache')).toBeNull();
    expect(res.headers.get('X-Edge-Filled-At')).toBeNull();
  });
});
