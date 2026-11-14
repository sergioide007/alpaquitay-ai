/**
 * Maintainer tooling for the model CDN (Node only): key generation, manifest building with per-block
 * hashes, signing, and an end-to-end verifier to run against the live CDN after every deployment.
 * Lives in src/ so it is type-checked and covered by the same tests as the code that consumes its output.
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign as cryptoSign } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  HASH_CHUNK_BYTES, KNOWN_DTYPES, MIME_BY_EXTENSION, extensionOf, isAllowedOrigin, manifestSigUrl, manifestUrl, mimeFor,
  parseManifest, type ManifestFile, type ManifestRuntime, type ModelManifest,
} from './cdnPolicy';
import { keyIdOf, verifySignedManifest, type ManifestSignature } from './manifestTrust';
import type { RuntimePins } from './integrity';

// ── Keys & signatures ─────────────────────────────────────────────────────────

export function generateSigningKey(): { privatePem: string; publicB64: string; keyId: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const raw = (publicKey.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32).toString('base64');
  return { privatePem: privateKey.export({ format: 'pem', type: 'pkcs8' }) as string, publicB64: raw, keyId: keyIdOf(raw) };
}

export function publicKeyOfPrivatePem(pem: string): string {
  const pub = createPublicKey(createPrivateKey(pem));
  return (pub.export({ format: 'der', type: 'spki' }) as Buffer).subarray(-32).toString('base64');
}

export function signManifestBytes(manifestBytes: Uint8Array, privatePem: string): ManifestSignature {
  const sig = cryptoSign(null, Buffer.from(manifestBytes), createPrivateKey(privatePem)).toString('base64');
  return { alg: 'ed25519', keyId: keyIdOf(publicKeyOfPrivatePem(privatePem)), sig };
}

// ── Manifest building ─────────────────────────────────────────────────────────

/** SHA-256 of each HASH_CHUNK_BYTES block, streaming (a 1.6 GB file never sits in memory). */
export async function hashFileChunks(file: string, chunkBytes = HASH_CHUNK_BYTES): Promise<string[]> {
  const hashes: string[] = [];
  const block = Buffer.alloc(chunkBytes); let filled = 0;
  for await (const piece of fs.createReadStream(file, { highWaterMark: 1024 * 1024 }) as AsyncIterable<Buffer>) {
    let off = 0;
    while (off < piece.length) {
      const take = Math.min(chunkBytes - filled, piece.length - off);
      piece.copy(block, filled, off, off + take);
      filled += take; off += take;
      if (filled === chunkBytes) { hashes.push(createHash('sha256').update(block).digest('hex')); filled = 0; }
    }
  }
  if (filled > 0) { hashes.push(createHash('sha256').update(block.subarray(0, filled)).digest('hex')); }
  return hashes;
}

export function listFiles(dir: string, base = dir): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

export interface BuildManifestInput {
  dir: string; id: string; label: string; license?: string;
  runtime: ManifestRuntime; sequence?: number;
}

/** Refuses to build a manifest that advertises something the Worker or the engine could not deliver. */
export function checkPublishable(files: string[], runtime: ManifestRuntime): string[] {
  const problems: string[] = [];
  for (const f of files) {
    if (!(extensionOf(f) in MIME_BY_EXTENSION)) { problems.push(`${f}: extension no permitida por el Worker (MIME estricto)`); }
    if (f.split('/').some(s => !/^[A-Za-z0-9._-]+$/.test(s))) { problems.push(`${f}: nombre con caracteres no permitidos`); }
  }
  for (const d of runtime.dtypes) {
    if (!(KNOWN_DTYPES as readonly string[]).includes(d)) { problems.push(`dtype desconocido: ${d}`); continue; }
    if (!files.some(f => f.startsWith('onnx/') && f.endsWith('.onnx') && new RegExp(`_${d}\\.onnx$`).test(f))) {
      problems.push(`dtype "${d}" declarado pero no hay ningun onnx/*_${d}.onnx`);
    }
  }
  return problems;
}

export async function buildManifest(input: BuildManifestInput): Promise<ModelManifest> {
  const files = listFiles(input.dir).filter(f => f !== 'manifest.json' && f !== 'manifest.sig.json').sort();
  const problems = checkPublishable(files, input.runtime);
  if (problems.length) { throw new Error('No se puede publicar:\n  ' + problems.join('\n  ')); }
  const entries: ManifestFile[] = [];
  const digest = createHash('sha256');
  for (const f of files) {
    const abs = path.join(input.dir, f);
    const sha256 = await hashFileChunks(abs);
    entries.push({ path: f, size: fs.statSync(abs).size, sha256 });
    digest.update(`${f}:${sha256.join(',')}\n`);
  }
  return parseManifest({
    schema: 2, id: input.id, label: input.label, license: input.license,
    revision: digest.digest('hex').slice(0, 16),
    sequence: input.sequence ?? Math.floor(Date.now() / 1000),
    chunkBytes: HASH_CHUNK_BYTES, runtime: input.runtime, files: entries,
  });
}

// ── Post-deploy verifier ──────────────────────────────────────────────────────

export interface Check { name: string; ok: boolean; detail?: string }
export interface VerifyOptions {
  base: string; id: string; trustedKeys: string[];
  fetchImpl?: typeof fetch; full?: boolean; pins?: RuntimePins;
  /** Origin sent like a VS Code Webview would (default vscode-webview://alpaquitay-verify). */
  origin?: string;
}

const REQUIRED_HEADERS: Record<string, (v: string | null) => boolean> = {
  'cross-origin-embedder-policy': v => v === 'require-corp',
  'cross-origin-resource-policy': v => v === 'cross-origin',
  'cross-origin-opener-policy': v => v === 'same-origin',
  'x-content-type-options': v => v === 'nosniff',
};

async function hashStream(res: Response, chunkBytes: number): Promise<{ hashes: string[]; size: number }> {
  const hashes: string[] = []; const block = Buffer.alloc(chunkBytes); let filled = 0, size = 0;
  const reader = res.body!.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) { break; }
    size += value.length;
    let off = 0;
    while (off < value.length) {
      const take = Math.min(chunkBytes - filled, value.length - off);
      block.set(value.subarray(off, off + take), filled); filled += take; off += take;
      if (filled === chunkBytes) { hashes.push(createHash('sha256').update(block).digest('hex')); filled = 0; }
    }
  }
  if (filled > 0) { hashes.push(createHash('sha256').update(block.subarray(0, filled)).digest('hex')); }
  return { hashes, size };
}

export async function verifyCdn(o: VerifyOptions): Promise<{ ok: boolean; checks: Check[] }> {
  const f = o.fetchImpl ?? fetch;
  const origin = o.origin ?? 'vscode-webview://alpaquitay-verify';
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, detail: ok ? undefined : detail }); return ok; };
  // identity: this tool must never feed a decompressor either; the bytes are compared raw.
  const get = (url: string, init: RequestInit = {}) =>
    f(url, { ...init, headers: { Origin: origin, 'Accept-Encoding': 'identity', ...(init.headers as Record<string, string> | undefined) } });

  add('origin used for CORS checks is allow-listed', isAllowedOrigin(origin), origin);

  let manifest: ModelManifest;
  try {
    const mRes = await get(manifestUrl(o.base, o.id));
    const sRes = await get(manifestSigUrl(o.base, o.id));
    if (!add('manifest.json and manifest.sig.json reachable', mRes.ok && sRes.ok, `HTTP ${mRes.status} / ${sRes.status}`)) { return { ok: false, checks }; }
    const bytes = new Uint8Array(await mRes.arrayBuffer());
    manifest = verifySignedManifest(bytes, await sRes.json(), o.trustedKeys, o.id);
    add('manifest signature valid for a trusted key', true);
    add('manifest served uncompressed (no Content-Encoding)', !mRes.headers.get('content-encoding'), mRes.headers.get('content-encoding') ?? '');
    add('manifest served with revalidation + no-transform', /must-revalidate/.test(mRes.headers.get('cache-control') ?? '') && /no-transform/.test(mRes.headers.get('cache-control') ?? ''), mRes.headers.get('cache-control') ?? 'missing');
    add('manifest content-type is JSON', (mRes.headers.get('content-type') ?? '').startsWith('application/json'), mRes.headers.get('content-type') ?? 'missing');
    add('CORS allows the Webview origin', mRes.headers.get('access-control-allow-origin') === origin, mRes.headers.get('access-control-allow-origin') ?? 'missing');
    for (const [h, ok] of Object.entries(REQUIRED_HEADERS)) { add(`header ${h}`, ok(mRes.headers.get(h)), mRes.headers.get(h) ?? 'missing'); }
  } catch (err) {
    add('manifest verification', false, (err as Error).message);
    return { ok: false, checks };
  }

  const unsafe = await get(`${o.base}/models/${o.id}/index.html`);
  add('disallowed extension is refused with 415', unsafe.status === 415, `HTTP ${unsafe.status}`);
  const missing = await get(`${o.base}/models/${o.id}/definitely-not-here.json`);
  add('unknown file is 404', missing.status === 404, `HTTP ${missing.status}`);

  for (const file of manifest.files) {
    const url = `${o.base}/models/${o.id}/${file.path}`;
    const head = await get(url, { method: 'HEAD' });
    const wantType = mimeFor(file.path);
    add(`${file.path}: HEAD 200 + MIME`, head.status === 200 && head.headers.get('content-type') === wantType, `HTTP ${head.status} ${head.headers.get('content-type')}`);
    add(`${file.path}: Accept-Ranges + immutable`, head.headers.get('accept-ranges') === 'bytes' && /immutable/.test(head.headers.get('cache-control') ?? ''), `${head.headers.get('accept-ranges')} / ${head.headers.get('cache-control')}`);
    if (file.size > 100) {
      const part = await get(url, { headers: { Range: 'bytes=0-99' } });
      add(`${file.path}: Range 0-99 → 206 + Content-Range`, part.status === 206 && part.headers.get('content-range') === `bytes 0-99/${file.size}`, `HTTP ${part.status} ${part.headers.get('content-range')}`);
      await part.arrayBuffer();
    }
    if (o.full) {
      const res = await get(url);
      const { hashes, size } = await hashStream(res, manifest.chunkBytes);
      add(`${file.path}: every block matches the signed hashes`, size === file.size && hashes.length === file.sha256.length && hashes.every((h, i) => h === file.sha256[i]), `size ${size}/${file.size}`);
    } else {
      const first = await get(url, { headers: { Range: `bytes=0-${Math.min(manifest.chunkBytes, file.size) - 1}` } });
      const { hashes } = await hashStream(first, manifest.chunkBytes);
      add(`${file.path}: first block matches (use --full for all)`, hashes[0] === file.sha256[0], 'hash mismatch');
    }
  }

  if (o.pins) {
    for (const [name, want] of Object.entries(o.pins.files)) {
      const url = `${o.base}/models/runtime/${o.pins.version}/${name}`;
      const res = await get(url);
      if (!add(`runtime ${name}: reachable`, res.ok, `HTTP ${res.status}`)) { continue; }
      add(`runtime ${name}: MIME`, res.headers.get('content-type') === mimeFor(name), res.headers.get('content-type') ?? 'missing');
      const got = createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex');
      add(`runtime ${name}: hash equals the pin in the extension`, got === want, 'hash mismatch');
    }
  }
  return { ok: checks.every(c => c.ok), checks };
}
