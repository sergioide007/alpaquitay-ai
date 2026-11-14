/**
 * Closed loop, no mocks of our own code: stager → signer → the real Worker handler behind a real HTTP server →
 * the maintainer's verifier AND the consumer-side verification (manifest trust + verifying fetch).
 * If this passes, a first deployment built with the shipped scripts is consumable by the shipped engine.
 */
import * as fs from 'fs';
import * as http from 'http';
import { AddressInfo } from 'net';
import * as os from 'os';
import * as path from 'path';
import { Readable } from 'stream';
import { handleCdnRequest, type BucketLike } from '../../../local/cdnHandler';
import { HASH_CHUNK_BYTES } from '../../../local/cdnPolicy';
import { buildManifest, checkPublishable, generateSigningKey, publicKeyOfPrivatePem, signManifestBytes, verifyCdn } from '../../../local/cdnTooling';
import { IntegrityError, createVerifyingFetch } from '../../../local/integrity';
import { resolveTrustedManifest } from '../../../local/manifestTrust';
import { fetchBytesIdentity } from '../../../local/safeHttp';
import { MemStore, blockHashes, pattern, sha } from './fixtures';

jest.setTimeout(60_000);

const ID = 'gemma-4-e2b-it';
const runtime = { dtypes: ['q4'] as const, requiresWebGpu: false, systemRole: 'native' as const };
const MODEL = {
  'config.json': Buffer.from('{"model_type":"gemma4"}'),
  'tokenizer.json': Buffer.from('{"version":"1.0"}'),
  'onnx/decoder_model_merged_q4.onnx': Buffer.from(pattern(HASH_CHUNK_BYTES + 12_345)),   // two blocks: exercises block hashing
  'onnx/embed_tokens_q4.onnx': Buffer.from(pattern(4096, 3)),
};
const RUNTIME = { 'ort-wasm-simd-threaded.mjs': Buffer.from('export default 1;'), 'ort-wasm-simd-threaded.wasm': Buffer.from([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]) };

describe('CDN pipeline end to end', () => {
  let tmp: string, cdnRoot: string, modelDir: string, server: http.Server, base: string;
  const key = generateSigningKey();
  let pins: { version: string; files: Record<string, string> };

  const write = (root: string, rel: string, bytes: Buffer) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), bytes); };

  const bucket: BucketLike = {
    async get(k, { range, onlyIf }) {
      const file = path.join(cdnRoot, k);
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { return null; }
      const size = fs.statSync(file).size; const etag = `"${sha(Buffer.from(k + size)).slice(0, 12)}"`;
      if (onlyIf.get('If-None-Match') === etag) { return { httpEtag: etag, size }; }
      const m = /^bytes=(\d+)-(\d+)$/.exec(range.get('Range') ?? '');
      const start = m ? Number(m[1]) : 0, end = m ? Math.min(Number(m[2]), size - 1) : size - 1;
      const body = Readable.toWeb(fs.createReadStream(file, { start, end })) as unknown as ReadableStream;
      return { httpEtag: etag, size, body, ...(m ? { range: { offset: start, length: end - start + 1 } } : {}) };
    },
  };

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'alpaquitay-e2e-'));
    modelDir = path.join(tmp, 'model'); cdnRoot = path.join(tmp, 'cdn');
    for (const [rel, b] of Object.entries(MODEL)) { write(modelDir, rel, b); }

    // Stage: model files + signed manifest (what scripts/cdn-stage.js and cdn-sign.js do) + runtime files.
    const manifest = await buildManifest({ dir: modelDir, id: ID, label: 'Gemma 4 E2B (e2e)', license: 'apache-2.0', runtime: { ...runtime, dtypes: ['q4'] }, sequence: 1000 });
    for (const [rel, b] of Object.entries(MODEL)) { write(cdnRoot, `models/${ID}/${rel}`, b); }
    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2) + '\n');
    write(cdnRoot, `models/${ID}/manifest.json`, manifestBytes);
    write(cdnRoot, `models/${ID}/manifest.sig.json`, Buffer.from(JSON.stringify(signManifestBytes(manifestBytes, key.privatePem))));
    for (const [name, b] of Object.entries(RUNTIME)) { write(cdnRoot, `models/runtime/9.9.9/${name}`, b); }
    pins = { version: '9.9.9', files: Object.fromEntries(Object.entries(RUNTIME).map(([n, b]) => [n, sha(b)])) };

    server = http.createServer(async (req, res) => {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) { if (typeof v === 'string') { headers.set(k, v); } }
      const r = await handleCdnRequest(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers }), bucket);
      const out: Record<string, string> = {}; r.headers.forEach((v, k) => { out[k] = v; });
      res.writeHead(r.status, out);
      if (r.body && req.method !== 'HEAD') { Readable.fromWeb(r.body as never).pipe(res); } else { res.end(); }
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await new Promise<void>(r => { server.closeAllConnections?.(); server.close(() => r()); }); fs.rmSync(tmp, { recursive: true, force: true }); });

  it('the stager hashes exactly the 8 MiB blocks the engine verifies', async () => {
    const m = await buildManifest({ dir: modelDir, id: ID, label: 'x', runtime: { ...runtime, dtypes: ['q4'] } });
    const f = m.files.find(x => x.path === 'onnx/decoder_model_merged_q4.onnx')!;
    expect(f.sha256).toEqual(blockHashes(new Uint8Array(MODEL['onnx/decoder_model_merged_q4.onnx'])));
    expect(f.sha256).toHaveLength(2);
  });

  it('refuses to stage anything the Worker or the engine could not deliver', () => {
    const rt = { ...runtime, dtypes: ['q4' as const, 'q4f16' as const] };
    const problems = checkPublishable(['config.json', 'evil.exe', 'onnx/decoder_model_merged_q4.onnx', 'bad name.json'], rt);
    expect(problems.join('\n')).toMatch(/evil\.exe.*extension no permitida/);
    expect(problems.join('\n')).toMatch(/bad name\.json.*caracteres/);
    expect(problems.join('\n')).toMatch(/q4f16.*declarado pero no hay/);
  });

  it('the maintainer verifier reports a freshly staged CDN as fully healthy (full download)', async () => {
    const r = await verifyCdn({ base, id: ID, trustedKeys: [key.publicB64], full: true, pins });
    expect(r.checks.filter(c => !c.ok)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.checks.length).toBeGreaterThan(25);
  });

  it('the verifier refuses to trust a manifest signed by anyone else', async () => {
    const r = await verifyCdn({ base, id: ID, trustedKeys: [generateSigningKey().publicB64], pins });
    expect(r.ok).toBe(false);
    expect(r.checks.find(c => c.name === 'manifest verification')?.detail).toMatch(/no confiable/);
  });

  it('the extension host resolves the same manifest over the identity-only client (and the key id matches the signer)', async () => {
    const r = await resolveTrustedManifest({ fetchBytes: fetchBytesIdentity, cdnBase: base, modelId: ID, trustedKeys: [publicKeyOfPrivatePem(key.privatePem)], store: new MemStore() });
    expect(r.summary).toMatchObject({ id: ID, license: 'apache-2.0', source: 'network' });
    expect(r.manifest.files).toHaveLength(4);
  });

  it('the Webview-side fetch downloads every file through real HTTP and every byte verifies', async () => {
    const { manifest } = await resolveTrustedManifest({ fetchBytes: fetchBytesIdentity, cdnBase: base, modelId: ID, trustedKeys: [key.publicB64], store: new MemStore() });
    const vf = createVerifyingFetch(fetch, { cdnBase: base, modelId: ID, files: new Map(manifest.files.map(f => [f.path, f])) });
    for (const f of manifest.files) {
      const bytes = Buffer.from(await (await vf(`${base}/models/${ID}/${f.path}`)).arrayBuffer());
      expect(bytes.equals(MODEL[f.path as keyof typeof MODEL])).toBe(true);
    }
  });

  it('a single flipped byte on the CDN is caught by BOTH the verifier and the engine-side fetch, with the size unchanged', async () => {
    const file = path.join(cdnRoot, `models/${ID}/onnx/decoder_model_merged_q4.onnx`);
    const original = fs.readFileSync(file);
    const tampered = Buffer.from(original); tampered[HASH_CHUNK_BYTES + 100] ^= 0xff;   // inside the SECOND block
    fs.writeFileSync(file, tampered);
    try {
      const r = await verifyCdn({ base, id: ID, trustedKeys: [key.publicB64], full: true });
      expect(r.checks.filter(c => !c.ok).map(c => c.name)).toEqual(['onnx/decoder_model_merged_q4.onnx: every block matches the signed hashes']);

      const { manifest } = await resolveTrustedManifest({ fetchBytes: fetchBytesIdentity, cdnBase: base, modelId: ID, trustedKeys: [key.publicB64], store: new MemStore() });
      const vf = createVerifyingFetch(fetch, { cdnBase: base, modelId: ID, files: new Map(manifest.files.map(f => [f.path, f])) });
      await expect((await vf(`${base}/models/${ID}/onnx/decoder_model_merged_q4.onnx`)).arrayBuffer()).rejects.toThrow(IntegrityError);
    } finally { fs.writeFileSync(file, original); }
  });

  it('a tampered runtime file is caught by the pins check', async () => {
    const f = path.join(cdnRoot, 'models/runtime/9.9.9/ort-wasm-simd-threaded.mjs');
    const original = fs.readFileSync(f);
    fs.writeFileSync(f, Buffer.from('export default 2;'));
    try {
      const r = await verifyCdn({ base, id: ID, trustedKeys: [key.publicB64], pins });
      expect(r.checks.filter(c => !c.ok).map(c => c.name)).toEqual(['runtime ort-wasm-simd-threaded.mjs: hash equals the pin in the extension']);
    } finally { fs.writeFileSync(f, original); }
  });

  it('refuses a rollback: an older signed manifest cannot replace a newer one already seen', async () => {
    const store = new MemStore();
    await resolveTrustedManifest({ fetchBytes: fetchBytesIdentity, cdnBase: base, modelId: ID, trustedKeys: [key.publicB64], store });
    const older = await buildManifest({ dir: modelDir, id: ID, label: 'old', license: 'apache-2.0', runtime: { ...runtime, dtypes: ['q4'] }, sequence: 999 });
    const bytes = Buffer.from(JSON.stringify(older, null, 2) + '\n');
    const mf = path.join(cdnRoot, `models/${ID}/manifest.json`), sf = path.join(cdnRoot, `models/${ID}/manifest.sig.json`);
    const [origM, origS] = [fs.readFileSync(mf), fs.readFileSync(sf)];
    fs.writeFileSync(mf, bytes); fs.writeFileSync(sf, JSON.stringify(signManifestBytes(bytes, key.privatePem)));
    try {
      await expect(resolveTrustedManifest({ fetchBytes: fetchBytesIdentity, cdnBase: base, modelId: ID, trustedKeys: [key.publicB64], store })).rejects.toThrow(/Rollback rechazado/);
    } finally { fs.writeFileSync(mf, origM); fs.writeFileSync(sf, origS); }
  });
});
