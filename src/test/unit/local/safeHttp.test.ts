import * as http from 'http';
import { AddressInfo } from 'net';
import * as zlib from 'zlib';
import { fetchBytesIdentity } from '../../../local/safeHttp';

describe('fetchBytesIdentity (manifest path: no decompressor, ever)', () => {
  let server: http.Server; let base: string; let lastHeaders: http.IncomingHttpHeaders = {};
  const routes: Record<string, (res: http.ServerResponse) => void> = {};

  beforeAll(async () => {
    server = http.createServer((req, res) => { lastHeaders = req.headers; (routes[req.url ?? ''] ?? ((r) => { r.writeHead(404); r.end(); }))(res); });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => new Promise<void>(r => { server.closeAllConnections?.(); server.close(() => r()); }));

  routes['/ok'] = (res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"a":1}'); };
  routes['/identity'] = (res) => { res.writeHead(200, { 'content-encoding': 'identity' }); res.end('plain'); };
  // A perfectly VALID brotli / gzip body: still refused, because the answer must not reach any decoder.
  routes['/br'] = (res) => { res.writeHead(200, { 'content-encoding': 'br' }); res.end(zlib.brotliCompressSync(Buffer.from('{"a":1}'))); };
  routes['/gzip'] = (res) => { res.writeHead(200, { 'content-encoding': 'gzip' }); res.end(zlib.gzipSync(Buffer.from('{"a":1}'))); };
  routes['/redirect'] = (res) => { res.writeHead(302, { location: '/ok' }); res.end(); };
  routes['/big'] = (res) => { res.writeHead(200); res.end(Buffer.alloc(2048, 65)); };
  routes['/hang'] = () => { /* never answers */ };

  it('returns the exact bytes and asks for identity encoding', async () => {
    expect(Buffer.from(await fetchBytesIdentity(`${base}/ok`)).toString()).toBe('{"a":1}');
    expect(lastHeaders['accept-encoding']).toBe('identity');
  });
  it('accepts an explicit identity answer', async () => {
    expect(Buffer.from(await fetchBytesIdentity(`${base}/identity`)).toString()).toBe('plain');
  });
  it('rejects Brotli at the header stage, even for a valid stream', async () => {
    await expect(fetchBytesIdentity(`${base}/br`)).rejects.toThrow(/Content-Encoding "br" rechazado/);
  });
  it('rejects gzip as well: only identity is accepted', async () => {
    await expect(fetchBytesIdentity(`${base}/gzip`)).rejects.toThrow(/gzip.*rechazado/);
  });
  it('does not follow redirects and surfaces HTTP errors', async () => {
    await expect(fetchBytesIdentity(`${base}/redirect`)).rejects.toThrow(/HTTP 302/);
    await expect(fetchBytesIdentity(`${base}/nope`)).rejects.toThrow(/HTTP 404/);
  });
  it('enforces the size cap while streaming', async () => {
    await expect(fetchBytesIdentity(`${base}/big`, { maxBytes: 1000 })).rejects.toThrow(/demasiado grande/);
  });
  it('times out a server that never answers', async () => {
    await expect(fetchBytesIdentity(`${base}/hang`, { timeoutMs: 150 })).rejects.toThrow(/Tiempo de espera/);
  });
  it('refuses plain http to non-loopback hosts and unknown protocols without any network access', async () => {
    await expect(fetchBytesIdentity('http://example.com/x')).rejects.toThrow(/Solo https/);
    await expect(fetchBytesIdentity('ftp://example.com/x')).rejects.toThrow(/Solo https/);
    await expect(fetchBytesIdentity('not a url')).rejects.toThrow(/URL invalida/);
  });
});
