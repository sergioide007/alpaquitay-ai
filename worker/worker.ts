/// <reference types="@cloudflare/workers-types" />
import { handleCdnRequest, type BucketLike } from '../src/local/cdnHandler';

export interface Env { MODELS: R2Bucket }

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handleCdnRequest(req, env.MODELS as unknown as BucketLike);
  },
} satisfies ExportedHandler<Env>;
