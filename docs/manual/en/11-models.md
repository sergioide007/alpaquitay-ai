---
title: Available models
nav: Available models
description: Live status of the signed models the Alpaquitay AI local engine CDN serves, with the signature verified in your browser, and the measured comparison that chose the default model.
---

# Available models

This page queries the local engine's CDN (`alpaquitay.specsolid.com`) **right now**, downloads each published model's manifest and **verifies its Ed25519 signature in your browser** with the same public keys the extension ships. If a manifest were tampered with, you would see *invalid signature* here, just as VS Code would refuse it.

```models
```

> [!NOTE]
> Checking Ed25519 signatures in the browser needs a recent version (Chrome or Edge 137+, Firefox 129+, Safari 17+). Older browsers show *"your browser cannot verify Ed25519"*: that does not mean the model is wrong, only that this browser cannot check it. The extension always checks it.

## How the default model was chosen

Every candidate was tested with the real extension, in an isolated VS Code, on the same laptop (Intel UHD gen 9 integrated GPU) and with the same Spanish request, served from a local CDN with a test key.

| Model | License | Download | In VS Code | Spec quality |
|---|---|---|---|---|
| **Qwen2.5-Coder 1.5B Instruct** (`q4f16`) ✅ | Apache-2.0 | 1.26 GB | **3.3–4.8 tok/s** | The best: concrete engineering tasks, `SPEC-NNN`, epics, in Spanish |
| Gemma 3 1B (`q4`) | Gemma Terms of Use (use restrictions) | 0.82 GB | 5.9 tok/s | Weak: a single epic, no `SPEC-NNN`, content errors |
| Qwen3 1.7B | Apache-2.0 | 1.43 GB | ❌ does not load | — |
| Granite 4.0 1B | Apache-2.0 | 1.19 GB | ❌ garbage output or does not load | — |
| Gemma 4 E2B | Apache-2.0 | 3.2 GB | ❌ too large | — |

Conclusions:

- **Qwen2.5-Coder 1.5B** is the only code-specialised candidate that works in the WebGPU runtime, and the one that wrote the best specs. Its license (Apache-2.0) does not restrict use.
- On this class of machine the engine does not load models above about **1.3 GB**; that is why models that look better on paper (Qwen3, Gemma 4) are out for now.
- **Gemma 3 1B** is still published and can be chosen with `alpaquitay-ai.localEngine.modelId: "gemma-3-1b-it"`; it is faster but gives worse results.

The full method, the files and the two graph changes applied to the model are in [`docs/LOCAL-ENGINE.md`](https://github.com/sergioide007/alpaquitay-ai/blob/main/docs/LOCAL-ENGINE.md#6-choosing-the-model-measured-2026-11-15).

## Switching models

In your **user settings** (not the project's):

```json
{
  "alpaquitay-ai.localEngine.modelId": "gemma-3-1b-it"
}
```

Next time you run the command you will see the confirmation dialog with the new model's size. To go back to the default, delete the setting.

## When a model changes

When the project publishes a **new revision** (corrected files or an optimised graph), the manifest carries a new revision and a higher sequence. The extension notices, asks you to confirm the new download and deletes the old weights. It never accepts a sequence lower than one it has already seen.

## Publishing a model on your own CDN

To serve models from your own infrastructure (for example on a network without Internet access), the process is: prepare the graph, stage, sign with your key, upload and verify. Add your public key to `alpaquitay-ai.localEngine.extraTrustedKeys` and point `cdnBaseUrl` at your CDN. Full guide: [`worker/README.md`](https://github.com/sergioide007/alpaquitay-ai/blob/main/worker/README.md) and [`docs/LOCAL-ENGINE.md` §6–7](https://github.com/sergioide007/alpaquitay-ai/blob/main/docs/LOCAL-ENGINE.md#7-operations).
