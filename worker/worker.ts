/// <reference types="@cloudflare/workers-types" />
import { WorkerEntrypoint } from 'cloudflare:workers';
import { handleCdnRequest, serveEdgeObject, type BucketLike } from '../src/local/cdnHandler';

export interface Env { MODELS: R2Bucket }

/**
 * CACHED entrypoint (caching is switched on for it alone in wrangler.toml). Cloudflare consults its cache before
 * running this code; it only runs on a miss. It answers with the whole object and nothing that depends on the caller,
 * so one cache entry serves every origin. Never routed to directly: only the default entrypoint calls it.
 */
export class ModelsCache extends WorkerEntrypoint<Env> {
  async fetch(req: Request): Promise<Response> {
    return serveEdgeObject(req, this.env.MODELS as unknown as BucketLike);
  }
}

type CachedEntrypoint = { fetch(req: Request): Promise<Response> };

/**
 * Default entrypoint = gateway. NOT cached: it runs on every request, applies CORS/COEP/MIME rules per caller, and
 * decides whether a file may be answered by ModelsCache (small, whole-file GET/HEAD) or must go straight to R2
 * (manifests, `.onnx_data`, any `Range` request). See edgeTtlFor() in src/local/cdnPolicy.ts.
 */
export default {
  fetch(req, env, ctx): Promise<Response> {
    const edge = (r: Request) => (ctx.exports as unknown as { ModelsCache: CachedEntrypoint }).ModelsCache.fetch(r);
    return handleCdnRequest(req, env.MODELS as unknown as BucketLike, edge);
  },
} satisfies ExportedHandler<Env>;
