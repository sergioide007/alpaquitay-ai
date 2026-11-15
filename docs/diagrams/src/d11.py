from dlib import *
W, H = 1120, 780
d = D(W, H, 'Process design · Local engine', 'Local model: WebGPU / Wasm on your machine, weights from a static CDN',
      'Inference runs in a Webview (the only place VS Code exposes WebGPU). The CDN only serves files; prompts never leave the machine.', '11-local-gemma-engine')

host = d.card(40, 122, 320, 'Extension host (Node)',
              'alpaquitay-ai.generateSpecLocal · LocalGemmaProvider (opt-in "local-wasm"). Asks before any download, shows progress, writes specs/<slug>.md in spec.md format.', SIGNAL, h=150)
web = d.card(400, 122, 320, 'Webview (Chromium)',
             'GemmaWasmEngine singleton · transformers.js + onnxruntime-web. CSP: connect-src is the CDN origin only. Picks WebGPU if an adapter exists, else Wasm.', BLUE, h=150)
cdn = d.card(760, 122, 320, 'alpaquitay.specsolid.com',
             'Cloudflare Worker: CORS allow-list · COEP / CORP · strict MIME (.wasm .onnx .json) · Range + ETag. R2 bucket behind it, $0 compute per inference.', AMBER, h=150)

d.arrow([host.right(-20), web.left(-20)], MUTED, label='generate', lpos=.5, lside='top')
d.arrow([web.left(30), host.right(30)], MUTED, label='progress · done', lpos=.5, lside='bottom')
d.arrow([web.right(-20), cdn.left(-20)], MUTED, label='MISS only', lpos=.5, lside='top')
d.arrow([cdn.left(30), web.right(30)], MUTED, label='stream', lpos=.5, lside='bottom')

idb = d.card(400, 340, 320, 'IndexedDB cache',
             'Files stored in 8 MB chunks, served back as a lazy stream. The meta record is written last, so a half download is never used. manifest.json revision invalidates old weights.', PURPLE, h=140)
gpu = d.card(400, 540, 320, 'Local GPU / CPU',
             'WebGPU (JSEP build) or Wasm (single thread in a Webview). q4 ONNX weights.', PINK, h=96)
files = d.card(760, 340, 320, 'What the CDN serves',
               '/models/<id>/manifest.json\n/models/<id>/onnx/model_q4.onnx\n/models/runtime/<ort>/ort-wasm-*.{mjs,wasm}', CYAN, h=140, body_mono=True, bsize=10)
d.arrow([web.bot(), idb.top()], MUTED, label='match / put', lpos=.5, lside='right')
d.arrow([idb.bot(), gpu.top()], MUTED)
d.arrow([cdn.bot(), files.top()], MUTED)

first = d.card(40, 340, 320, 'First run', 'probe → size from manifest → confirm download → fetch → store → load → generate.', AMBER, h=100)
again = d.card(40, 456, 320, 'Next runs', 'Cache HIT: no network needed for weights. Offline works if the model was already cached.', SIGNAL, h=100)
d.arrow([first.bot(), again.top()], MUTED)

d.text(40, 700, 'Privacy:   the prompt and the answer stay in the Webview; the CDN only ever sees GET requests for static files.', 12, SIGNAL, False, mono=True)
d.text(40, 724, 'Settings: alpaquitay-ai.localEngine.{enabled, cdnBaseUrl, modelId, device, maxNewTokens}. Clear the cache with “Clear Local Model Cache”.', 11.5, MUTED)
d.legend(40, H - 24, [(SIGNAL, 'Extension host'), (BLUE, 'Webview engine'), (AMBER, 'CDN'), (PURPLE, 'Cache'), (PINK, 'Hardware')])
d.save('docs/diagrams')
