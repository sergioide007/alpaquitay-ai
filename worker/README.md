# Local engine CDN — `alpaquitay.specsolid.com/models/*`

Static hosting for the Gemma ONNX model and the ONNX Runtime files used by the local engine (`src/local/`, `engine/`).
The Worker adds the headers the Webview needs and runs no inference. **The CDN is untrusted by design**: what makes a file
valid is the Ed25519 signature over `manifest.json`, not the server. Architecture, threat model and a worked example with
the default model (Qwen2.5-Coder 1.5B Instruct): [`docs/LOCAL-ENGINE.md`](../docs/LOCAL-ENGINE.md).

## Contract (what the extension expects)

| Path | Content | MIME | Cache-Control |
|---|---|---|---|
| `/models/<id>/manifest.json` | schema 2: `{ id, label, revision, sequence, chunkBytes, license?, runtime, files: [{ path, size, sha256: [per 8 MiB block] }] }` | `application/json` | `max-age=300, must-revalidate, no-transform` |
| `/models/<id>/manifest.sig.json` | `{ alg: "ed25519", keyId, sig }` over the exact bytes of `manifest.json` | `application/json` | same |
| `/models/<id>/<files…>` | `config.json`, `tokenizer.json`, `onnx/*_q4f16.onnx`, `*.onnx_data`, … | by extension | `max-age=31536000, immutable, no-transform` |
| `/models/runtime/<onnxruntime-web version>/ort-wasm-simd-threaded[.asyncify].{mjs,wasm}` | ONNX Runtime, **hash-pinned inside the extension** | `text/javascript` / `application/wasm` | immutable |

Allowed extensions (anything else is **415**): `wasm`, `onnx`, `onnx_data`, `model`, `json`, `txt`, `jinja`, `mjs`.
Allowed origins: `https://alpaquitay.specsolid.com`, `https://alpaquitay-ai.specsolid.com`, `https://specsolid.com`, and VS Code Webviews (`vscode-webview://<id>`).
Every response carries `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: cross-origin`, `Cross-Origin-Opener-Policy: same-origin` and `X-Content-Type-Options: nosniff`; `Range` and `ETag`/`If-None-Match` are supported.
The single source of truth for all of this is `src/local/cdnPolicy.ts` (shared by the Worker, the extension and the tests).

## First deployment

1. **Build the tooling and make your signing key** (the repository ships with none; the private key stays outside it):
   ```bash
   npm run check:node && npm ci && npm run compile && npm run build:engine
   npm run cdn:keygen -- --out ~/.alpaquitay/manifest-signing.pem
   # paste the printed public key into src/local/trustedKeys.ts, then: npm run compile && npm run build:engine
   ```
2. **Stage and sign** (copies the exact ONNX Runtime pinned in the bundle, hashes every block, writes `manifest.json`):
   ```bash
   npm run cdn:stage -- --model ./path/to/model --id qwen2.5-coder-1.5b-instruct --label "Qwen2.5-Coder 1.5B Instruct (q4f16)" --license apache-2.0 \
       --dtypes q4f16 --requires-webgpu --system-role native --min-ram-gb 8 --top-p 0.8 --top-k 20
   npm run cdn:sign -- --key ~/.alpaquitay/manifest-signing.pem --id qwen2.5-coder-1.5b-instruct
   ```
   The stager refuses files the Worker would not serve and dtypes for which no `onnx/*_<dtype>.onnx` exists.
3. **Create the bucket, upload** `cdn-staging/models/**` (keep the `models/` prefix) and **deploy the Worker**:
   ```bash
   npx wrangler r2 bucket create alpaquitay-models
   # rclone or the S3 API are better than `wrangler r2 object put` for multi-GB files
   npx wrangler deploy --config worker/wrangler.toml
   ```
4. **Verify the live CDN exactly as the extension will consume it** (non-zero exit = do not release):
   ```bash
   npm run cdn:verify -- --base https://alpaquitay.specsolid.com --id qwen2.5-coder-1.5b-instruct --full
   ```
   It checks the signature, headers (CORS for a Webview origin, COEP/CORP/COOP, no `Content-Encoding` on the manifest), MIME,
   `Range`/206, 415/404 behaviour, every block hash of every file, and the ONNX Runtime hashes against the pins in the bundle.

## Updating, rolling back, rotating keys

See [`docs/LOCAL-ENGINE.md` §7](../docs/LOCAL-ENGINE.md#7-operations). In short: re-stage and re-sign to update; **never re-upload an
old manifest** to roll back (it is refused as a rollback), re-stage the old files so they get a higher `sequence`.

## Edge cache (Cloudflare Workers Cache)

Small static files (`config.json`, `tokenizer.json`, `onnx/*.onnx`, the ONNX Runtime) are answered from Cloudflare's edge cache, which
also spares R2 reads. It is built as a **gateway + cached entrypoint** because Cloudflare's cache strips `Range` before it calls the Worker
and honours `Vary: Origin` (one variant per `vscode-webview://<id>`):

| Request | Served by | Why |
|---|---|---|
| Small file, whole-file `GET`/`HEAD` | `ModelsCache` (cached entrypoint) | One entry for every origin; the gateway adds CORS/COEP per caller |
| Any request with `Range` | R2 directly (`X-Edge-Cache: BYPASS`) | The cache would fetch the whole object to slice it |
| `*.onnx_data` (multi-GB weights) | R2 directly | Above the 512 MB cacheable cap, and the file that depends on real `Range` support |
| `manifest.json`, `manifest.sig.json` | R2 directly | A stale manifest next to freshly uploaded files breaks every client |

Edge TTL is **1 h** for model files (fixed paths overwritten in place) and **7 d** for `/models/runtime/<version>/`. It is set with
`Cloudflare-CDN-Cache-Control`, so the browser-facing `Cache-Control` is unchanged. Limits, TTLs and the routing rule live in `src/local/cdnPolicy.ts`.
Requires Wrangler >= 4.107.0 (per-entrypoint caching). Workers Cache is recent: re-read its [docs](https://developers.cloudflare.com/workers/cache/) before a release.

**Publishing a new model revision:** upload to R2, then `npx wrangler deploy --config worker/wrangler.toml`. The Worker version is part of the cache key, so a
deploy starts from an empty cache; without it a stale small file can live up to the TTL. Then run `cdn:verify`.

**Check that the cache works** (two plain `GET`s; `cf-cache-status` only shows if Cloudflare exposes it to the gateway, so `x-edge-filled-at` is the reliable signal):

```bash
URL=https://alpaquitay.specsolid.com/models/qwen2.5-coder-1.5b-instruct/onnx/model_q4f16.onnx
for i in 1 2; do curl -s -D - -o /dev/null "$URL" | grep -iE '^(HTTP/|x-edge-|cf-cache-status|cache-control)'; echo; done
```

Same `x-edge-filled-at` on both = the second answer came from the cache without reading R2. A value that changes every time = not cached.
`*.onnx_data` must report `x-edge-cache: BYPASS`: that is by design, not a failure.

## Cloudflare notes

- Disable any transformation (minification, compression rules, Polish) on `/models/*`.
- Free-tier limits change: check the current [R2](https://developers.cloudflare.com/r2/pricing/) and Workers pricing pages before you announce "free".
