---
title: Commands, shortcuts and settings reference
nav: Reference
description: Every Alpaquitay AI command, keyboard shortcut and setting with its default value.
---

# Commands, shortcuts and settings reference

## Commands

All of them are in the Command Palette (<kbd>F1</kbd>) under the **Alpaquitay AI:** prefix.

| Command | Shortcut | What it does |
|---|---|---|
| Open Alpaquitay Hub | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd> | Opens the main panel. |
| Show Alpaquitay Commands | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> | Quick menu with the main commands. |
| New Specification | — | Creates a spec from a template in `specs/`. |
| Generate from Specification | — | Generates code from a spec file (writes directly). |
| Validate Against Specification | — | Checks the code against a spec. |
| Generate Specification (Local Model) | — | Writes a spec with the local model, on your GPU. |
| Clear Local Model Cache | — | Deletes the cached model files. |
| Configure AI Provider | — | Stores an API key or configures a local server. |

On macOS, use <kbd>Cmd</kbd> instead of <kbd>Ctrl</kbd>.

## Chat commands

`onboard` · `dora` · `deuda` · `economía` · `postmortem <text>` · `diff <path>` · `si aplicar` · `no` · `promover` · `si`. Details in [Chat commands](../chat-commands/).

## Settings

Change them in VS Code's settings UI, in `settings.json` or, for the provider ones, in the Hub's **Settings** tab.

### Provider and model

| Setting | Default | Description |
|---|---|---|
| `alpaquitay-ai.preferredProvider` | `auto` | `auto`, `ollama`, `lmstudio`, `local-wasm`, `anthropic` or `openai`. `auto` tries the local ones first. |
| `alpaquitay-ai.anthropic.model` | `claude-opus-5-5` | Anthropic model ID. |
| `alpaquitay-ai.anthropic.baseUrl` | `https://api.anthropic.com/v1` | For proxies or compatible APIs. |
| `alpaquitay-ai.openai.model` | `gpt-6.1-sol` | OpenAI model ID. |
| `alpaquitay-ai.openai.baseUrl` | `https://api.openai.com/v1` | For Azure OpenAI or proxies. |
| `alpaquitay-ai.ollama.endpoint` | `http://localhost:11434` | Ollama server address. |
| `alpaquitay-ai.ollama.model` | `codellama` | Ollama model. |
| `alpaquitay-ai.lmstudio.endpoint` | `http://localhost:1234` | LM Studio server address. |
| `alpaquitay-ai.maxTokens` | `4096` | Maximum tokens per request. |
| `alpaquitay-ai.temperature` | `0.3` | 0 = deterministic, 2 = creative. |
| `alpaquitay-ai.requestTimeout` | `120000` | Maximum time per request, in milliseconds. |
| `alpaquitay-ai.systemPrompt` | empty | Global instructions for every request. |
| `alpaquitay-ai.orgContext` | empty | Your organisation's name or context. |

### Project and tools

| Setting | Default | Description |
|---|---|---|
| `alpaquitay-ai.specFile` | `spec.md` | Spec file at the root (for example `tasks.md`). |
| `alpaquitay-ai.skill.maxParallel` | `3` | Maximum skills in parallel. |
| `alpaquitay-ai.mcp.filesystem.enabled` | `true` | Lets the AI read and write workspace files. |
| `alpaquitay-ai.mcp.git.enabled` | `true` | Lets the AI read the Git history. |
| `alpaquitay-ai.indexing.enabled` | `false` | Workspace indexing (coming soon). |
| `alpaquitay-ai.enableTelemetry` | `false` | Anonymous usage statistics. Never code or prompts. |

### Local engine

`enabled`, `modelId`, `cdnBaseUrl` and `extraTrustedKeys` are only read from your **user settings** (application scope): a project you open cannot turn the engine on, change the model, redirect the download or add keys.

| Setting | Default | Description |
|---|---|---|
| `alpaquitay-ai.localEngine.enabled` | `false` | Use the local engine as a provider. |
| `alpaquitay-ai.localEngine.modelId` | `qwen2.5-coder-1.5b-instruct` | Model under `/models/` on the CDN. |
| `alpaquitay-ai.localEngine.cdnBaseUrl` | `https://alpaquitay.specsolid.com` | The models' CDN (https). |
| `alpaquitay-ai.localEngine.extraTrustedKeys` | `[]` | Extra Ed25519 public keys (your own mirror). |
| `alpaquitay-ai.localEngine.device` | `auto` | `auto`, `webgpu` or `wasm`. |
| `alpaquitay-ai.localEngine.dtype` | `auto` | `auto`, `q4`, `q4f16`, `q8`, `fp16` or `fp32`. |
| `alpaquitay-ai.localEngine.maxNewTokens` | `1024` | Maximum new tokens per local generation. |

### A VS Code setting worth knowing

| Setting | Purpose |
|---|---|
| `window.dialogStyle` | `native` (default) shows modal dialogs, such as the model download confirmation, as operating-system windows. `custom` draws them inside VS Code. |

## Files Alpaquitay writes

| Path | Written by |
|---|---|
| `spec.md` | You, *Create with AI*, *Regen*, `promover`, a code request confirmed in the chat (replaces the file) and the board when it closes tasks. |
| `specs/*.md` | *New Specification* and *Generate Specification (Local Model)*. |
| `infra/main.*` | *Export as IaC* in Architecture. |
| `*.edited.*` | The Docs agent when applying edits (unless you choose to overwrite). |
| `.alpaquitay/` | The harness: decisions, debt, economy, fingerprint, platform, ADRs, memory, ideas, architecture and backups. |
