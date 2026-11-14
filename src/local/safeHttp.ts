/**
 * Byte-exact HTTP GET for the extension host, with NO decompression.
 *
 * Why not fetch(): Node's fetch advertises `br, gzip, deflate` over HTTPS and transparently decodes whatever
 * `Content-Encoding` the server answers with (verified on Node 22). The Brotli decoder carried an out-of-bounds
 * write (CVE-2026-111497, fixed in Node 22.23.4 / 24.22.1 / 26.12.1) and, in a signed-manifest design, bytes would be
 * DECODED before the signature is checked. Here the decoder is never reached: we ask for `identity`, and any other
 * Content-Encoding is rejected at the header stage, before a single body byte is read.
 */
import * as http from 'http';
import * as https from 'https';
import { isLoopbackHost } from './cdnPolicy';

export interface BytesFetchOptions { timeoutMs?: number; maxBytes?: number }
export type FetchBytes = (url: string, opts?: BytesFetchOptions) => Promise<Uint8Array>;

export const fetchBytesIdentity: FetchBytes = (url, opts = {}) => new Promise<Uint8Array>((resolve, reject) => {
  let u: URL;
  try { u = new URL(url); } catch { reject(new Error(`URL invalida: ${url}`)); return; }
  const secure = u.protocol === 'https:';
  if (!secure && !(u.protocol === 'http:' && isLoopbackHost(u.hostname))) {
    reject(new Error('Solo https (http unicamente en loopback).')); return;
  }
  const maxBytes = opts.maxBytes ?? 512 * 1024;
  const lib = secure ? https : http;
  let settled = false;
  const fail = (e: Error) => { if (!settled) { settled = true; reject(e); } };

  const req = lib.request(u, {
    method: 'GET',
    headers: { 'Accept-Encoding': 'identity', 'Accept': 'application/json', 'User-Agent': 'alpaquitay-ai-local-engine' },
    timeout: opts.timeoutMs ?? 10_000,
  }, (res) => {
    const encoding = String(res.headers['content-encoding'] ?? 'identity').trim().toLowerCase();
    if (res.statusCode !== 200) { res.resume(); fail(new Error(`HTTP ${res.statusCode} en ${url} (no se siguen redirecciones)`)); return; }
    if (encoding !== 'identity') {
      res.destroy();
      fail(new Error(`Content-Encoding "${encoding}" rechazado: la ruta del manifiesto no descomprime nada.`));
      return;
    }
    const chunks: Buffer[] = []; let total = 0;
    res.on('data', (c: Buffer) => {
      total += c.length;
      if (total > maxBytes) { res.destroy(); fail(new Error(`Respuesta de ${url} demasiado grande (max ${maxBytes} bytes)`)); return; }
      chunks.push(c);
    });
    res.on('end', () => { if (!settled) { settled = true; resolve(new Uint8Array(Buffer.concat(chunks))); } });
    res.on('error', fail);
  });
  req.on('timeout', () => req.destroy(new Error(`Tiempo de espera agotado en ${url}`)));
  req.on('error', fail);
  req.end();
});
