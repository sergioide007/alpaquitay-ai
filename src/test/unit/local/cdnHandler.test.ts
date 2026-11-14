import { BucketLike, BucketObject, handleCdnRequest } from '../../../local/cdnHandler';

const bodyOf = (u: Uint8Array) => new Response(u as unknown as BodyInit).body;
const WEBVIEW = 'vscode-webview://0a1b2c3d';

function bucketWith(files: Record<string, Uint8Array>): BucketLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
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
      return { httpEtag: etag, size: data.length, body: bodyOf(data) };
    },
  };
}

const files = {
  'models/g/manifest.json': new TextEncoder().encode('{"id":"g"}'),
  'models/g/onnx/m.onnx': new Uint8Array(1000).fill(7),
  'models/runtime/1.0.0/ort.wasm': new Uint8Array([0, 0x61, 0x73, 0x6d]),
  'models/g/page.html': new TextEncoder().encode('<script>alert(1)</script>'),
};
const get = (path: string, headers: Record<string, string> = {}, method = 'GET') =>
  new Request(`https://alpaquitay.specsolid.com${path}`, { method, headers });

describe('handleCdnRequest (Worker logic)', () => {
  it('serves a model file with strict MIME, COEP/CORP, CORS for the Webview and immutable cache', async () => {
    const res = await handleCdnRequest(get('/models/g/onnx/m.onnx', { Origin: WEBVIEW }), bucketWith(files));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(WEBVIEW);
    expect(res.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    expect(res.headers.get('Cross-Origin-Resource-Policy')).toBe('cross-origin');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(res.headers.get('Cache-Control')).toContain('immutable');
    expect(res.headers.get('Cache-Control')).toContain('no-transform');
    expect(res.headers.get('Content-Length')).toBe('1000');
    expect(res.headers.get('ETag')).toBe('"etag-1000"');
  });

  it('serves .wasm as application/wasm', async () => {
    const res = await handleCdnRequest(get('/models/runtime/1.0.0/ort.wasm'), bucketWith(files));
    expect(res.headers.get('Content-Type')).toBe('application/wasm');
  });

  it('manifest.json must revalidate', async () => {
    const res = await handleCdnRequest(get('/models/g/manifest.json'), bucketWith(files));
    expect(res.headers.get('Cache-Control')).toContain('must-revalidate');
    expect(res.headers.get('Content-Type')).toContain('application/json');
  });

  it('answers a Range request with 206 and a correct Content-Range', async () => {
    const res = await handleCdnRequest(get('/models/g/onnx/m.onnx', { Range: 'bytes=100-299' }), bucketWith(files));
    expect(res.status).toBe(206);
    expect(res.headers.get('Content-Range')).toBe('bytes 100-299/1000');
    expect(res.headers.get('Content-Length')).toBe('200');
    expect((await res.arrayBuffer()).byteLength).toBe(200);
  });

  it('returns 304 when If-None-Match matches', async () => {
    const res = await handleCdnRequest(get('/models/g/onnx/m.onnx', { 'If-None-Match': '"etag-1000"' }), bucketWith(files));
    expect(res.status).toBe(304);
    expect(res.headers.get('ETag')).toBe('"etag-1000"');
  });

  it('HEAD returns headers and no body', async () => {
    const res = await handleCdnRequest(get('/models/g/onnx/m.onnx', {}, 'HEAD'), bucketWith(files));
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
    expect(res.headers.get('Content-Length')).toBe('1000');
  });

  it('answers the CORS preflight without touching the bucket', async () => {
    const b = bucketWith(files);
    const res = await handleCdnRequest(get('/models/g/onnx/m.onnx', { Origin: WEBVIEW }, 'OPTIONS'), b);
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(WEBVIEW);
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Range');
    expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
    expect(b.calls).toHaveLength(0);
  });

  it('does not grant CORS to a foreign origin', async () => {
    const res = await handleCdnRequest(get('/models/g/onnx/m.onnx', { Origin: 'https://evil.example.com' }), bucketWith(files));
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('refuses types outside the allow-list (415) without reading the bucket', async () => {
    const b = bucketWith(files);
    const res = await handleCdnRequest(get('/models/g/page.html'), b);
    expect(res.status).toBe(415);
    expect(b.calls).toHaveLength(0);
  });

  it.each(['/', '/models/../etc.json', '/other/x.json', '/models/%2e%2e/secret.json', '/models/%2E%2E%2Fsecret.json', '/models/g/a%5Cb.json'])('404 for unsafe path %s', async (p) => {
    const b = bucketWith(files);
    expect((await handleCdnRequest(get(p), b)).status).toBe(404);
    expect(b.calls).toHaveLength(0);
  });

  it('URL dot-segment normalization can never leave /models/', async () => {
    const b = bucketWith(files);
    await handleCdnRequest(get('/models/g/%2e%2e/manifest.json'), b);
    expect(b.calls).toEqual(['models/manifest.json']);
    expect(b.calls.every(k => k.startsWith('models/'))).toBe(true);
  });

  it('404 for a missing object and 405 for writes, both with isolation headers', async () => {
    const missing = await handleCdnRequest(get('/models/g/none.json'), bucketWith(files));
    expect(missing.status).toBe(404);
    expect(missing.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
    const post = await handleCdnRequest(get('/models/g/onnx/m.onnx', {}, 'POST'), bucketWith(files));
    expect(post.status).toBe(405);
    expect(post.headers.get('Allow')).toBe('GET, HEAD, OPTIONS');
  });
});
