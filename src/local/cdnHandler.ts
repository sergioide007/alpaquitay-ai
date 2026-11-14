import {
  buildCdnHeaders,
  cacheControlFor,
  contentRangeHeader,
  isSafeModelPath,
  mimeFor,
} from './cdnPolicy';

/** The slice of R2 the handler needs; lets the Worker logic run (and be tested) without Cloudflare. */
export interface BucketObject {
  httpEtag: string;
  size: number;
  range?: { offset?: number; length?: number };
  body?: ReadableStream | null;
}
export interface BucketLike {
  get(key: string, opts: { range: Headers; onlyIf: Headers }): Promise<BucketObject | null>;
}

function reply(status: number, origin: string | null, body: BodyInit | null, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...buildCdnHeaders({ origin }), ...extra } });
}

export async function handleCdnRequest(req: Request, bucket: BucketLike): Promise<Response> {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') { return reply(204, origin, null, { 'Access-Control-Max-Age': '86400' }); }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return reply(405, origin, 'Metodo no permitido', { Allow: 'GET, HEAD, OPTIONS' });
  }

  const { pathname } = new URL(req.url);
  if (!isSafeModelPath(pathname)) { return reply(404, origin, 'No encontrado'); }

  // Strict MIME: unknown extensions are refused, never served as a guess.
  const type = mimeFor(pathname);
  if (!type) { return reply(415, origin, 'Tipo de archivo no permitido'); }

  const obj = await bucket.get(pathname.slice(1), { range: req.headers, onlyIf: req.headers });
  if (!obj) { return reply(404, origin, 'No encontrado'); }

  const base = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cacheControlFor(pathname) };
  // R2 returns metadata without a body when If-None-Match matches.
  if (!obj.body) {
    return new Response(null, { status: 304, headers: { ...buildCdnHeaders({ origin, etag: obj.httpEtag }), ...base } });
  }

  const contentRange = req.headers.has('Range') && obj.range ? contentRangeHeader(obj.range, obj.size) : undefined;
  const length = contentRange ? obj.range!.length! : obj.size;
  return new Response(req.method === 'HEAD' ? null : obj.body, {
    status: contentRange ? 206 : 200,
    headers: {
      ...buildCdnHeaders({ origin, etag: obj.httpEtag, contentRange }),
      ...base,
      'Content-Length': String(length),
    },
  });
}
