import { makeManifest } from './fixtures';
import {
  HASH_CHUNK_BYTES, manifestSigUrl, summarize, type ModelManifest,
  buildCdnHeaders, cacheControlFor, contentRangeHeader, formatBytes, isAllowedOrigin, isSafeModelPath,
  isValidModelId, manifestUrl, mimeFor, normalizeCdnBase, parseManifest, totalBytes, DEFAULT_CDN_BASE,
} from '../../../local/cdnPolicy';

describe('cdnPolicy', () => {
  describe('mimeFor (strict MIME allow-list)', () => {
    it.each([
      ['/models/g/onnx/model_q4.onnx', 'application/octet-stream'],
      ['/models/g/onnx/model_q4.onnx_data', 'application/octet-stream'],
      ['/models/runtime/1.2.3/ort-wasm-simd-threaded.jsep.wasm', 'application/wasm'],
      ['/models/runtime/1.2.3/ort-wasm-simd-threaded.jsep.mjs', 'text/javascript; charset=utf-8'],
      ['/models/g/config.json', 'application/json; charset=utf-8'],
    ])('%s -> %s', (p, mime) => expect(mimeFor(p)).toBe(mime));

    it.each(['/models/g/evil.html', '/models/g/evil.js', '/models/g/noext', '/models/g/.onnx', '/models/g/a.exe'])(
      'rejects %s', (p) => expect(mimeFor(p)).toBeUndefined());
  });

  describe('isSafeModelPath', () => {
    it.each(['/models/gemma-4-e2b-it/manifest.json', '/models/gemma-4-e2b-it/onnx/model_q4.onnx', '/models/runtime/1.31.0-dev.20260914-8d85527a0/a.wasm'])(
      'accepts %s', (p) => expect(isSafeModelPath(p)).toBe(true));

    it.each(['/', '/models', '/models/', '/other/x.json', '/models/../secret.json', '/models/a/../b.json',
      '/models//x.json', '/models/a%2e%2e/x.json', '/models/a\\b.json', '/models/a b/x.json', '/models/' + 'a'.repeat(400)])(
      'rejects %s', (p) => expect(isSafeModelPath(p)).toBe(false));
  });

  describe('CORS / COEP headers', () => {
    it('echoes only allow-listed origins', () => {
      expect(isAllowedOrigin('https://alpaquitay.specsolid.com')).toBe(true);
      expect(isAllowedOrigin('vscode-webview://0a1b2c3d-4e5f')).toBe(true);
      expect(isAllowedOrigin('https://evil.example.com')).toBe(false);
      expect(isAllowedOrigin('https://alpaquitay.specsolid.com.evil.com')).toBe(false);
      expect(isAllowedOrigin(null)).toBe(false);
    });

    it('always sends isolation + nosniff headers, ACAO only for allowed origins', () => {
      const ok = buildCdnHeaders({ origin: 'vscode-webview://abc' });
      expect(ok['Access-Control-Allow-Origin']).toBe('vscode-webview://abc');
      expect(ok['Cross-Origin-Embedder-Policy']).toBe('require-corp');
      expect(ok['Cross-Origin-Resource-Policy']).toBe('cross-origin');
      expect(ok['Cross-Origin-Opener-Policy']).toBe('same-origin');
      expect(ok['X-Content-Type-Options']).toBe('nosniff');
      expect(ok['Vary']).toBe('Origin');
      expect(buildCdnHeaders({ origin: 'https://evil.example.com' })['Access-Control-Allow-Origin']).toBeUndefined();
    });
  });

  it('manifest revalidates, weights are immutable', () => {
    expect(cacheControlFor('/models/g/manifest.json')).toContain('must-revalidate');
    expect(cacheControlFor('/models/g/manifest.sig.json')).toContain('must-revalidate');
    expect(cacheControlFor('/models/g/onnx/model_q4.onnx')).toContain('immutable');
    expect(cacheControlFor('/models/g/onnx/model_q4.onnx')).toContain('no-transform');
  });

  it('contentRangeHeader needs a resolved range', () => {
    expect(contentRangeHeader({ offset: 0, length: 100 }, 1000)).toBe('bytes 0-99/1000');
    expect(contentRangeHeader({ offset: 500, length: 500 }, 1000)).toBe('bytes 500-999/1000');
    expect(contentRangeHeader({ offset: 0 }, 1000)).toBeUndefined();
  });

  describe('normalizeCdnBase', () => {
    it('keeps the default origin', () => expect(normalizeCdnBase(DEFAULT_CDN_BASE)).toBe('https://alpaquitay.specsolid.com'));
    it('strips a trailing slash', () => expect(normalizeCdnBase('https://alpaquitay.specsolid.com/')).toBe('https://alpaquitay.specsolid.com'));
    it('allows loopback http for local mirrors', () => expect(normalizeCdnBase('http://localhost:8787')).toBe('http://localhost:8787'));
    it('rejects IP-literal hosts in every spelling (TLS IP-SAN confusion class: CVE-2026-105483/106069/106072)', () => {
      for (const u of ['https://203.0.113.5', 'https://0xCB.0.113.5', 'https://3405803781', 'https://0313.0.113.5', 'https://[2001:db8::1]', 'https://２０３.０.１１３.５']) {
        expect(() => normalizeCdnBase(u)).toThrow(/nombre de dominio/);
      }
    });
    it('still allows loopback for local mirrors, however it is spelled', () => {
      expect(normalizeCdnBase('http://127.0.0.1:8787')).toBe('http://127.0.0.1:8787');
      expect(normalizeCdnBase('https://localhost')).toBe('https://localhost');
      expect(normalizeCdnBase('http://127.1:9000')).toBe('http://127.0.0.1:9000');
    });
    it.each(['http://alpaquitay.specsolid.com', 'ftp://x.com', 'not a url', 'https://x.com/models', 'https://x.com/?a=1', 'https://u:p@x.com'])(
      'rejects %s', (u) => expect(() => normalizeCdnBase(u)).toThrow());
  });

  describe('model ids and manifest (schema 2)', () => {
    it('model id follows transformers.js rules', () => {
      expect(isValidModelId('gemma-4-e2b-it')).toBe(true);
      expect(isValidModelId('a--b')).toBe(false);
      expect(isValidModelId('a..b')).toBe(false);
      expect(isValidModelId('a/b')).toBe(false);
      expect(isValidModelId('')).toBe(false);
    });

    const good = (): ModelManifest => makeManifest();

    it('parses a valid manifest and sums sizes', () => {
      const m = parseManifest(good(), 'gemma-4-e2b-it');
      expect(totalBytes(m)).toBe(100 + HASH_CHUNK_BYTES + 5000);
      expect(manifestUrl('https://c.example', 'g')).toBe('https://c.example/models/g/manifest.json');
      expect(manifestSigUrl('https://c.example', 'g')).toBe('https://c.example/models/g/manifest.sig.json');
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mutate = (fn: (m: any) => void) => { const m: any = JSON.parse(JSON.stringify(good())); fn(m); return m; };
    it.each([
      ['null', null],
      ['schema 1 (unsigned era)', mutate(m => { m.schema = 1; })],
      ['bad id', mutate(m => { m.id = 'x/y'; })],
      ['no revision', mutate(m => { m.revision = ''; })],
      ['negative sequence', mutate(m => { m.sequence = -1; })],
      ['fractional sequence', mutate(m => { m.sequence = 1.5; })],
      ['wrong chunkBytes', mutate(m => { m.chunkBytes = 1024; })],
      ['no files', mutate(m => { m.files = []; })],
      ['path traversal', mutate(m => { m.files[0].path = '../x.json'; })],
      ['duplicate path', mutate(m => { m.files[1].path = m.files[0].path; })],
      ['negative size', mutate(m => { m.files[0].size = -1; })],
      ['file over the per-file cap', mutate(m => { m.files[0].size = 5 * 1024 ** 3; m.files[0].sha256 = new Array(Math.ceil(5 * 1024 ** 3 / HASH_CHUNK_BYTES)).fill('a'.repeat(64)); })],
      ['hash count does not match size', mutate(m => { m.files[1].sha256.pop(); })],
      ['non-hex hash', mutate(m => { m.files[0].sha256[0] = 'zz'; })],
      ['unknown dtype', mutate(m => { m.runtime.dtypes = ['q3']; })],
      ['empty dtypes', mutate(m => { m.runtime.dtypes = []; })],
      ['bad systemRole', mutate(m => { m.runtime.systemRole = 'maybe'; })],
      ['requiresWebGpu not boolean', mutate(m => { m.runtime.requiresWebGpu = 'yes'; })],
      ['missing runtime', mutate(m => { delete m.runtime; })],
    ])('rejects: %s', (_n, raw) => expect(() => parseManifest(raw)).toThrow());

    it('refuses a model above the total size cap before the user is ever asked', () => {
      const big = mutate(m => {
        m.files = Array.from({ length: 3 }, (_, i) => ({ path: `f${i}.onnx_data`, size: 3 * 1024 ** 3, sha256: new Array(Math.ceil(3 * 1024 ** 3 / HASH_CHUNK_BYTES)).fill('b'.repeat(64)) }));
      });
      expect(() => parseManifest(big)).toThrow(/maximo permitido/);
    });

    it('refuses an id that does not match the requested model', () => expect(() => parseManifest(good(), 'other')).toThrow(/no coincide/));

    it('summarize exposes what the consent dialog needs', () => {
      expect(summarize(parseManifest(good()), 'network')).toMatchObject({ label: 'Gemma 4 E2B (test)', license: 'apache-2.0', requiresWebGpu: false, source: 'network' });
    });
  });

  it('formatBytes', () => {
    expect(formatBytes(500 * 1024)).toBe('500 KB');
    expect(formatBytes(300 * 1024 * 1024)).toBe('300 MB');
    expect(formatBytes(1.5 * 1024 ** 3)).toBe('1.50 GB');
  });
});
