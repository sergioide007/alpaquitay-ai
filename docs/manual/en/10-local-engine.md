---
title: "Local engine: AI on your machine with WebGPU"
nav: Local engine (WebGPU)
description: How to generate specs with a model that runs inside VS Code on your own GPU, without sending your text to any server: requirements, download confirmation, measured performance, cache, security and troubleshooting.
---

# Local engine: AI on your machine with WebGPU

> [!NOTE]
> Available from version **3.6.1** of the extension.

The local engine runs a language model **inside VS Code, on your own GPU**. Your text never leaves the machine: the only network traffic is a one-time download of the model files, which are signed. After that it works offline, and the server-side inference cost is **zero**.

```video
title: A spec generated on your machine
src: media/spec-local-en.mp4
poster: media/spec-local-en.jpg
duration: 0:53
caption: The Generate Specification (Local Model) command, the download confirmation, progress on the GPU and the resulting spec in specs/. Download and generation are sped up.
```

## What you need

| Requirement | Details |
|---|---|
| WebGPU in VS Code | A GPU with an up-to-date driver. The default model also needs the `shader-f16` feature. Recent integrated GPUs (for example Intel UHD/Iris) work. |
| Memory | At least 8 GB of RAM. |
| Disk | About 1.3 GB for the default model's cache. |
| Network | Only the first time (or when a new model revision is published). |

If your machine misses any of these, the command **refuses before downloading anything** and tells you why.

## Using it: Generate Specification (Local Model)

1. Open a project folder.
2. **Select text** in the editor describing what you want to specify, or select nothing.
3. Run **Alpaquitay AI: Generate Specification (Local Model)** from the Command Palette (<kbd>F1</kbd>) or the <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> menu.
4. If you selected nothing, type the description in the box (*«Describe el proyecto o la funcionalidad que quieres especificar (se procesa en tu equipo)»*: describe the project or feature; it is processed on your machine). A request written in English produces a spec in English.
5. **The first time, confirm the download** (see the next section).
6. Follow the progress in the notification: runtime check, download, caching, loading on the GPU and token-by-token generation with its speed.
7. The result is written to `specs/<name>.md` in the same format the Work tab reads. It **never overwrites** an existing spec: if the name is taken, it adds `-2`, `-3`…

You can cancel at any time from the notification.

## The download confirmation

Before downloading anything, VS Code shows a **modal dialog**:

![The model download confirmation dialog](media/local-consent.png "The confirmation dialog: model, license, download size and privacy guarantees. Shown here drawn inside VS Code (window.dialogStyle: custom).")

It shows the model and its license, the **verified download size** and these guarantees: integrity is checked against a signed manifest before any file is used, and your text is never sent to the CDN. In English:

- *«Alpaquitay: el motor local necesita descargar el modelo.»* — the local engine needs to download the model.
- *«La integridad se verifica con un manifiesto firmado antes de usar cualquier archivo.»* — integrity is verified against a signed manifest before any file is used.
- *«Tu texto nunca se envía a la CDN: la inferencia ocurre en tu equipo.»* — your text is never sent to the CDN; inference happens on your machine.

Then:

- **Descargar y generar** (download and generate) starts the download.
- **Cancel** (or <kbd>Esc</kbd>) stops the command: nothing is downloaded and nothing leaves your machine.

> [!IMPORTANT]
> **The dialog needs your click.** With VS Code's default setting (`window.dialogStyle: native`) it is an **operating-system dialog**: a separate window that may open away from where you are looking. Until you answer, the notification stays on *«Preparando motor local…»* (preparing the local engine). If you see that and nothing happens, look for the dialog in the taskbar. If you prefer it drawn inside the VS Code window, set `"window.dialogStyle": "custom"` in your settings.

The dialog shows again when a **new revision** of the model is published, because it has to be downloaded again.

## Real performance

Measured on 15 November 2026 on a laptop with an Intel UHD (gen 9) integrated GPU, VS Code 1.146, from the production CDN, with the default model:

| Phase | Time |
|---|---|
| Downloading and verifying 1.26 GB | about 3 minutes at ~7 MB/s (depends on your connection) |
| Caching and loading on the GPU | about 15 seconds |
| Generation | **4.5–4.7 tokens/s**; a spec with 3 epics in ~45 s |
| Later runs | no download: just loading and generation |

> [!NOTE]
> This is a 1.5-billion-parameter model. It writes good **first drafts** of specs; it does not replace a large model. If the result does not follow the `spec.md` format, the command warns you so you can review it.

## Using it as an AI provider

Besides the command, the engine can be one more provider, like Ollama:

```json
{
  "alpaquitay-ai.localEngine.enabled": true,
  "alpaquitay-ai.preferredProvider": "local-wasm"
}
```

With `preferredProvider` set to `auto`, it is used after Ollama and LM Studio. Keep its size in mind: it is fine for questions, ideas and specs; for multi-file tasks a larger model in Ollama or the cloud gives better results.

## Cache and disk space

- Files are stored in VS Code's own cache (the engine panel's IndexedDB), in 8 MiB blocks. A half-finished download is never used.
- When the model revision changes, the old weights are deleted automatically.
- **Alpaquitay AI: Clear Local Model Cache** empties the cache completely.

## Security: why you can trust what is downloaded

The CDN is treated as **untrusted** by design. What makes a file valid is its signature, not the server:

1. Every model has a `manifest.json` **signed with Ed25519**. The extension ships the project's public keys and refuses any manifest not signed by them, or older than the last one it saw (rollback protection).
2. The manifest lists a **SHA-256 for every 8 MiB block** of every file. A changed byte, an unlisted file or a block that does not match is refused.
3. The **ONNX Runtime** files are pinned by hash inside the extension itself, and the engine panel cannot load remote scripts.
4. The manifest is downloaded **without decompression**: no decompressor parses network bytes before the signature check.
5. The CDN address, the model and the trusted keys can **only** be changed in your user settings, never in a project's: a repository you open cannot redirect the download.

![Local engine architecture](diagrams/11-local-gemma-engine.svg "The extension host, the engine panel with its cache, the static CDN behind a Cloudflare Worker, and your GPU.")

You can check for yourself which models are published and whether their signature is valid in [Available models](../models/).

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `alpaquitay-ai.localEngine.enabled` | `false` | Use the engine as an AI provider. The command works even when it is off. |
| `alpaquitay-ai.localEngine.modelId` | `qwen2.5-coder-1.5b-instruct` | Which model to use (see [Models](../models/)). User settings only. |
| `alpaquitay-ai.localEngine.device` | `auto` | `auto`, `webgpu` or `wasm` (CPU). |
| `alpaquitay-ai.localEngine.dtype` | `auto` | Weight precision. Change it only if you see corrupted output. |
| `alpaquitay-ai.localEngine.maxNewTokens` | `1024` | Maximum new tokens per generation. |
| `alpaquitay-ai.localEngine.cdnBaseUrl` | `https://alpaquitay.specsolid.com` | CDN the models are downloaded from. User settings only. |
| `alpaquitay-ai.localEngine.extraTrustedKeys` | `[]` | Extra public keys for your own CDN mirror. User settings only. |

## If something goes wrong

The engine's messages are in Spanish; here they are with their meaning.

| Message or symptom | What it means | What to do |
|---|---|---|
| Stuck on *«Preparando motor local…»* | The confirmation dialog is waiting for your answer. | Find it in the taskbar and answer it. |
| *«VS Code está en renderizado por software…»* (software rendering) | VS Code's GPU process failed and Chromium switched to software rendering. | Close **every** VS Code window and open it again. `code --status` must show `webgpu: enabled` under *GPU Status*. |
| *«la GPU (…) no concede un adaptador WebGPU»* (no WebGPU adapter) | The driver or Chromium's blocklist prevents WebGPU. | Update your graphics driver. |
| *«este VS Code no expone la API navigator.gpu»* | VS Code is too old. | Update VS Code. |
| *«Este modelo requiere WebGPU…»* (this model requires WebGPU) | Without WebGPU this model would be unusably slow on the CPU (single thread). | Fix WebGPU with the rows above. |
| *«La GPU se quedó sin memoria o falló durante la generación»* (GPU out of memory) | The GPU had no memory for that request. The model is released. | Close other apps using the GPU, shorten the description and try again. |
| *«Memoria agotada al cargar el modelo: reintentando en un panel nuevo»* (out of memory, retrying in a new panel) | On the first run the engine panel held the download, the cache and the model at once and ran out of memory. | Nothing: the extension retries once by itself in a new panel. |
| *«No hubo memoria suficiente para cargar el modelo…»* (not enough memory) | The new panel ran out of memory too. | Close memory-hungry apps (virtual machines, browsers with many tabs) and try again; what is already cached is not downloaded again. |
| Quota or storage error | No space for the cache. | Free disk space and try again. |

More cases in [Troubleshooting](../troubleshooting/).
