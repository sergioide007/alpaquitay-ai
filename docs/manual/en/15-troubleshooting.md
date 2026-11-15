---
title: Troubleshooting and FAQ
nav: Troubleshooting and FAQ
description: Fixes for the most common Alpaquitay AI problems (no provider, Ollama not detected, tasks that never reach Done, debt ceiling, local engine without WebGPU) and answers to frequent questions.
---

# Troubleshooting and FAQ

## Common problems

### «No hay proveedor AI disponible» (no AI provider available)

No provider is active. Check, in this order:

1. Is Ollama running? Open `http://localhost:11434` in a browser: it must answer *Ollama is running*. Does it have a model? `ollama list`.
2. Does LM Studio have a model loaded **and** its server started?
3. Did you store a key with **Configure AI Provider**?
4. Does `preferredProvider` point at one that is not available? Set it to `auto`.

After starting Ollama, pick the model in the Hub header selector or reload the window (*Developer: Reload Window*).

### Ollama answers take very long or are cut off

Raise `alpaquitay-ai.requestTimeout` (for example to `300000`) and, in **Settings → Ollama**, *Max output tokens*. On machines without a dedicated GPU, use a smaller model.

### The task never reaches *Done*

That is the DoD gate doing its job. The chat says what blocks it:

- *«N diff(s) sin aplicar»* (unapplied diffs) → reply `si aplicar` or `no`.
- *«contrato platform sin verificar — corre `onboard` primero»* (platform contract not verified) → run `onboard` and confirm the test command if asked.
- Build or tests failed → read the postmortem in the chat, fix it and try again.

### *«Build bloqueado por techo de deuda»* (Build blocked by the debt ceiling)

Debt reached 100. Pay it down: `onboard` (−10), apply or discard the pending diffs and close tasks with evidence (−8 each). Check the status with `deuda`. [Details](../harness/#agentic-debt)

### *«Bloqueado: protegido … (secretos)»* or *«fuera de fuentes evidenciadas»*

The policy or the automatic review stopped a file:

- Secret files (`.env`, `*.pem`, `*.key`…) are never written by the harness. Edit them yourself.
- *Fuera de fuentes evidenciadas* (outside the evidenced sources) means the file is outside the detected source folders. If the folder is right, run `onboard` again to refresh the project fingerprint.

### I want to undo a `si aplicar`

A checkpoint was saved before writing: `git stash list` shows one named `alpaquitay/apply-diffs-<date>`. Discard unwanted changes with Git (for example `git restore <file>`) or bring back the checkpoint state with `git stash apply stash@{N}`.

### My whole `spec.md` changed after a `si` in the chat

You confirmed a code request typed in the chat, which generates a new `spec.md` from the request. A checkpoint was saved first; get the previous version back with `git stash list` (look for `alpaquitay/code-<date>` or `alpaquitay/spec-<date>`) and `git checkout stash@{N} -- spec.md`, or with `git checkout -- spec.md` if it was committed. To keep it, add new tasks to the board instead of asking for them in the chat. [Details](../harness/#the-three-lanes)

### The board does not show my tasks

- Is your spec called `spec.md` and at the root? If not, change `alpaquitay-ai.specFile`.
- Do the tasks use the `- [ ] text` format under a `##` heading? [Format](../work/#1-the-spec-spec-md)
- Click ↻ in the *Spec* pane to reload.

### The local engine does not work

The full table of messages and fixes is in [Local engine → If something goes wrong](../local-engine/#if-something-goes-wrong). The two most common causes:

1. **The confirmation dialog is waiting for your click** out of sight. Look for it in the taskbar.
2. **VS Code is rendering in software** after its GPU process failed. Close all its windows and open it again; check with:

```bash
code --status
```

*GPU Status* must show `webgpu: enabled`.

### A cloud model answers with a 400 error

Current Claude and GPT models reason before answering and reject some older request parameters. From version 3.6.1 Alpaquitay only sends `temperature` to models that accept it and uses `max_completion_tokens` with OpenAI. If you use an older version, choose a model from the selector or update the extension.

### Ctrl+Shift+A opens something else

That shortcut is also GitHub Copilot's. Alpaquitay uses it for its quick menu, which includes an entry to open Copilot Chat. To use another shortcut, change it in *File → Preferences → Keyboard Shortcuts* by searching for `alpaquitay-ai.showMenu`.

## Frequently asked questions

**Does Alpaquitay send my code to an Alpaquitay server?**
No. There is no intermediary server. With a local provider your code never leaves the machine; with a cloud one it goes straight to that provider after the privacy boundary. The project's only server is the static model CDN, which only serves signed files and never receives your text.

**Is it free?**
Yes, the extension is free and open source (MIT). You only pay for what you use of a cloud provider, if you choose one.

**Do I need a GPU?**
Not to use Alpaquitay with Ollama, LM Studio or the cloud. Yes for the local engine (WebGPU).

**Can I use it on a company project?**
Yes. For confidential code, use local providers only and see the recipe [Work without your code leaving your machine](../use-cases/#3-work-without-your-code-leaving-your-machine).

**Why does it ask so much before acting?**
On purpose: *ask-before-act* is one of its five principles. Short replies (`si`, `si aplicar`, `no`) make confirming take a second.

**Are the DORA metrics real?**
They are signals derived from Git and labelled as such. For operational metrics you need your deployment and incident data.

**Why are some messages and commands in Spanish?**
Alpaquitay was born in a Spanish-speaking community. The harness commands (`deuda`, `si aplicar`, `promover`…) and some notifications are Spanish words; this manual translates each one where it appears.

**Does it work with GitHub Copilot installed?**
Yes, they coexist. Alpaquitay's quick menu includes an entry for Copilot Chat.

**Where do I report a bug?**
In [GitHub Issues](https://github.com/sergioide007/alpaquitay-ai/issues). If it is a vulnerability, by private email, never in a public issue ([SECURITY.md](https://github.com/sergioide007/alpaquitay-ai/blob/main/SECURITY.md)).
