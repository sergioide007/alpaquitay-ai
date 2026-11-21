---
title: AI providers and privacy
nav: Providers and privacy
description: How to connect Ollama, LM Studio, the WebGPU local engine, Anthropic or OpenAI in Alpaquitay AI, how auto mode chooses, and what the privacy boundary protects.
---

# AI providers and privacy

Alpaquitay has no cloud model of its own and never routes your data through a server of its own. You choose who answers: a model on your machine, or a cloud API that the extension calls directly.

## The five providers

| Provider | Where it runs | Privacy | Cost | How to enable it |
|---|---|---|---|---|
| **Ollama** | Your machine | Fully local | Free | Install Ollama and pull a model (`ollama pull <model>`). Detected at `http://localhost:11434`. |
| **LM Studio** | Your machine | Fully local | Free | Load a model in LM Studio and start its local server. Detected at `http://localhost:1234`. |
| **Alpaquitay AI · Qwen 2.5 (on-device)** | Inside VS Code, on your GPU | Fully local (initial download of the signed model) | Free | Enable it in the **Settings** provider picker; model: Qwen2.5-Coder 1.5B. See [Local engine](../local-engine/). |
| **Anthropic Claude** | Anthropic's cloud | Direct call, through the privacy boundary | API pricing | API key in the OS keychain. |
| **OpenAI** | OpenAI's cloud (or Azure OpenAI) | Direct call, through the privacy boundary | API pricing | API key in the OS keychain. |

```video
title: Configuring a provider
src: media/providers-en.mp4
poster: media/providers-en.jpg
duration: 0:21
caption: The Settings tab: choose the provider, the model, the token limit and the temperature. API keys are never written to the settings.
```

## How `auto` mode chooses

With `alpaquitay-ai.preferredProvider` set to `auto` (the default), Alpaquitay uses **the first available** in this order:

1. Ollama
2. LM Studio
3. Local model (only if you turned it on with `localEngine.enabled`)
4. Anthropic (only if you stored its key)
5. OpenAI (only if you stored its key)

In short: **local first**. If you prefer a specific one, set it in `preferredProvider` (`ollama`, `lmstudio`, `local-wasm`, `anthropic` or `openai`); if it is not available, the order above applies. You can also switch models at any time with the selector in the Hub header.

## Connecting a local model

### Ollama

```bash
# Install Ollama from https://ollama.com, then:
ollama pull qwen2.5-coder
# Others that work well for code: llama3.2, deepseek-coder, codellama
```

In **Settings → AI Provider → Ollama**, type the model name (default `codellama`) and, if needed, the endpoint.

### LM Studio

Load any GGUF model in LM Studio and click *Start Server*. Alpaquitay uses whatever model is loaded there; there is nothing to choose in the extension.

> [!NOTE]
> An Ollama or LM Studio server **off your machine** (for example `http://192.168.1.20:11434`) is treated as **cloud**: its requests go through the privacy boundary like Anthropic's or OpenAI's. Only loopback addresses (`localhost`, `127.0.0.1`) count as local.

### Small models

Models under about 4 billion parameters (names with `1.3b`, `3b`, `mini`, `nano`, `gemma:2b`…) are detected by name. For them Alpaquitay uses shorter, stricter instructions, lowers the temperature and strips the filler comments they tend to add. Even so, for tasks that touch several files a 7B model or larger gives clearly better results.

## Connecting Anthropic or OpenAI

1. Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> → **Configure AI Provider**.
2. Choose the provider and paste your key.
3. Choose the model in **Settings**. The selector lists known models, but the `alpaquitay-ai.anthropic.model` and `alpaquitay-ai.openai.model` settings accept **any model ID** your account can use.

Models in the selector (checked on 15 November 2026 against each provider's documentation; price per million input and output tokens):

| Provider | Model | Price | Good for |
|---|---|---|---|
| Anthropic | **Claude Opus 5.5** (`claude-opus-5-5`, default) | $4 / $20 | Architecture, multi-file tasks, reviews |
| Anthropic | Claude Sonnet 5.5 (`claude-sonnet-5-5`) | $2 / $10 | Everyday coding at half the price |
| Anthropic | Claude Haiku 5.5 (`claude-haiku-5-5`) | $0.10 / $0.50 | Fast, high-volume tasks |
| Anthropic | Claude Fable 5.2 (`claude-fable-5-2`) | $8 / $40 | The most demanding reasoning (needs 30-day data retention on your account) |
| OpenAI | **GPT-6.1 Sol** (`gpt-6.1-sol`, default) | $2 / $10 | Balance of capability and cost |
| OpenAI | GPT-6 Astra (`gpt-6-astra`) | $10 / $50 | OpenAI's most capable model |
| OpenAI | GPT-6.1 Terra (`gpt-6.1-terra`) | $1 / $5 | Fast; writing and revising text |
| OpenAI | GPT-6 Luna (`gpt-6-luna`) | $0.10 / $0.50 | High volume at the lowest cost |

All of them have about a million tokens of context and up to 128,000 output tokens, and all of them reason before answering. That is why Alpaquitay does not send them a temperature (they reject it) and leaves output room for the reasoning: if your token limit is below 16,000, these models get 16,000.

The key is stored in the **operating-system keychain** through VS Code's SecretStorage: never in `settings.json`, never in plain text and never in the repository. For Azure OpenAI or a compatible proxy, change `alpaquitay-ai.openai.baseUrl` (or `anthropic.baseUrl`).

## The privacy boundary

When a request goes to a cloud provider, it first passes the **privacy boundary** (`PrivacyBoundaryProvider`):

1. It **detects and replaces** personal data (emails, phone numbers, ID numbers, cards, IBANs, IP addresses, dates of birth, medical record numbers) and **secrets** (credentials, bearer tokens, private keys, provider API keys, AWS keys, JWTs) with placeholders.
2. It **sends** the cleaned request straight to your provider.
3. It **returns** the reply exactly as the provider wrote it. Placeholders are **not reversed**: if the reply quotes a value that was hidden, you will see the placeholder instead.
4. It **records metadata only**: how many replacements and of which kind, never the detected values. The record is written before the call, so failed requests are audited too.

![Providers and the privacy boundary](diagrams/05-provider-privacy.svg "Local models receive the text unchanged. Whatever leaves the machine is cleaned first and audited without values.")

The **Evidence** tab shows the boundary's state (the *Privacy boundary* card): telemetry, replacements and where the keys are stored.

> [!IMPORTANT]
> The privacy boundary lowers the risk, but it does not anonymise your code: the source code itself is sent to the cloud provider you choose. If your code must not leave your machine, use a local provider.

## Telemetry

`alpaquitay-ai.enableTelemetry` is `false`. If you turn it on, only anonymous usage statistics are sent; **never** code or prompts. Details are in the [privacy policy](https://github.com/sergioide007/alpaquitay-ai/blob/main/PRIVACY.md).

## Global model settings

![The Settings tab with provider, model and global defaults](media/hub-settings.png "Settings: provider tabs, model, global limits, system prompt and tools.")

In **Settings → Global Defaults**:

| Setting | Default | Effect |
|---|---|---|
| Max output tokens | 4096 | Reply limit when the provider has none of its own. |
| Temperature | 0.3 | 0 = deterministic, 2 = creative. For code, stay between 0 and 0.4. It is sent to local models and to cloud models that accept it; Alpaquitay does not send it to current reasoning models. |
| Request timeout | 120,000 ms | Maximum time per request. Raise it for slow local models. |
| System Prompt | empty | Instructions added to every request (for example, your team's conventions). |
| Organization context | empty | Your team's name or context, to tailor the answers. |
