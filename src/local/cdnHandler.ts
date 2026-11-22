import {
  EDGE_CACHE_MAX_BYTES,
  buildCdnHeaders,
  cacheControlFor,
  contentRangeHeader,
  edgeTtlFor,
  etagMatches,
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

/**
 * Calls the CACHED entrypoint of the Worker (`ModelsCache` in worker/worker.ts). Injected so this file stays free of
 * Cloudflare APIs and testable in plain Node.
 */
export type EdgeFetcher = (req: Request) => Promise<Response>;

function reply(status: number, origin: string | null, body: BodyInit | null, extra: Record<string, string> = {}): Response {
  return new Response(body, { status, headers: { ...buildCdnHeaders({ origin }), ...extra } });
}

export async function handleCdnRequest(req: Request, bucket: BucketLike, edge?: EdgeFetcher): Promise<Response> {
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

  // Small static files may be answered by the cached entrypoint. Ranged requests, manifests and the multi-GB weights
  // (see edgeTtlFor) never take this branch: they keep the direct R2 path below, unchanged.
  if (edge && edgeTtlFor(pathname) !== undefined && !req.headers.has('Range')) {
    const cached = await serveFromEdge(req, edge, pathname, type, origin);
    if (cached) { return cached; }
  }

  const obj = await bucket.get(pathname.slice(1), { range: req.headers, onlyIf: req.headers });
  if (!obj) { return reply(404, origin, 'No encontrado'); }

  const base: Record<string, string> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': cacheControlFor(pathname) };
  if (edge) { base['X-Edge-Cache'] = 'BYPASS'; }
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

/**
 * Gateway side. Asks the cached entrypoint for the whole object with a CLEAN request (no Origin, Range or
 * If-None-Match, no query string): the cache key is derived from that URL, so every visitor — including each VS Code
 * Webview, which has its own `vscode-webview://<id>` origin — shares one entry. Per-request headers are added here.
 * Returns undefined on any problem so the caller falls back to R2: the cache layer can never take the CDN down.
 */
async function serveFromEdge(req: Request, edge: EdgeFetcher, pathname: string, type: string, origin: string | null): Promise<Response | undefined> {
  let inner: Response;
  try {
    inner = await edge(new Request(new URL(pathname, req.url).toString(), { method: 'GET' }));
  } catch {
    return undefined;
  }
  if (inner.status !== 200 || !inner.body) {
    await inner.body?.cancel().catch(() => undefined);
    return undefined;
  }

  const etag = inner.headers.get('ETag') ?? undefined;
  // Diagnostics: Cloudflare's own status when it is visible here, and the instant the entry was filled. Two requests
  // that report the same X-Edge-Filled-At were answered by the cache without R2 being read again.
  const base: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheControlFor(pathname),
    'X-Edge-Cache': inner.headers.get('Cf-Cache-Status') ?? 'EDGE',
  };
  const filledAt = inner.headers.get('X-Edge-Filled-At');
  if (filledAt) { base['X-Edge-Filled-At'] = filledAt; }

  if (etagMatches(req.headers.get('If-None-Match'), etag)) {
    await inner.body.cancel().catch(() => undefined);
    return new Response(null, { status: 304, headers: { ...buildCdnHeaders({ origin, etag }), ...base } });
  }

  const headers: Record<string, string> = { ...buildCdnHeaders({ origin, etag }), ...base };
  const length = inner.headers.get('Content-Length');
  if (length) { headers['Content-Length'] = length; }
  if (req.method === 'HEAD') {
    await inner.body.cancel().catch(() => undefined);
    return new Response(null, { status: 200, headers });
  }
  return new Response(inner.body, { status: 200, headers });
}

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Body of the CACHED entrypoint (`ModelsCache`). It returns the WHOLE object and nothing tied to the caller: no CORS,
 * no `Vary`, no `Range`, no conditionals. That is what lets a single cache entry serve every origin.
 * Non-200 answers are `no-store`, so a 404 returned a moment before an upload finished is never remembered.
 * `Cloudflare-CDN-Cache-Control` is the edge-only TTL: Cloudflare consumes it and strips it from the response.
 */
export async function serveEdgeObject(req: Request, bucket: BucketLike, now: () => number = Date.now): Promise<Response> {
  const { pathname } = new URL(req.url);
  const ttl = isSafeModelPath(pathname) ? edgeTtlFor(pathname) : undefined;
  const type = mimeFor(pathname);
  if (ttl === undefined || !type) { return new Response(null, { status: 404, headers: NO_STORE }); }

  const obj = await bucket.get(pathname.slice(1), { range: new Headers(), onlyIf: new Headers() });
  if (!obj || !obj.body) { return new Response(null, { status: 404, headers: NO_STORE }); }
  if (obj.size > EDGE_CACHE_MAX_BYTES) {
    await obj.body.cancel().catch(() => undefined);
    return new Response(null, { status: 413, headers: NO_STORE });
  }

  return new Response(obj.body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(obj.size),
      'ETag': obj.httpEtag,
      'Cache-Control': cacheControlFor(pathname),
      'Cloudflare-CDN-Cache-Control': `max-age=${ttl}`,
      'X-Edge-Filled-At': String(now()),
    },
  });
}
