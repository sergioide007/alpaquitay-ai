---
title: Installation and first steps
nav: Installation and first steps
description: How to install Alpaquitay AI in VS Code from the Marketplace or Open VSX, open the Hub with Ctrl+Alt+A and use the Ctrl+Shift+A quick menu.
---

# Installation and first steps

In five minutes you will have the extension installed, an AI provider connected and the Hub open on your project.

## Requirements

| You need | Details |
|---|---|
| Visual Studio Code | 1.85 or later (Windows, macOS or Linux). It also works in compatible editors that install from Open VSX, such as VSCodium. |
| An open folder | The harness works on the workspace folder: it analyses it, writes `spec.md` there and keeps its evidence in `.alpaquitay/`. |
| Git (recommended) | DORA signals, the traceable history and the checkpoints before writing use Git. Without Git the extension works, but without those three things. |
| An AI provider | Local (Ollama, LM Studio, local engine) or cloud (Anthropic, OpenAI). You choose it in [chapter 2](../providers/). |

## Install

**From the VS Code Marketplace (recommended).** Open the Extensions view (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>X</kbd>), search for **Alpaquitay AI** and click *Install*. Or from a terminal:

```bash
code --install-extension alpaquitay-ai.alpaquitay-ai
```

**From Open VSX** (VSCodium and other editors):

```bash
ovsx install alpaquitay-ai.alpaquitay-ai
```

The extension activates on its own once VS Code has started. It asks for no account or sign-up, and telemetry is **off**.

## The two shortcuts you need

| Shortcut (Windows/Linux) | macOS | What it opens |
|---|---|---|
| <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd> | <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd> | The **Hub**: the main panel with all the tabs. |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> | <kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd> | The **quick menu**: open the Hub, new specification, generate from a specification, validate against it, generate a specification with the local model, configure the provider, or open GitHub Copilot Chat. |

![Alpaquitay quick menu with Ctrl+Shift+A](media/menu.png "The quick menu (Ctrl+Shift+A). It includes an entry for Copilot Chat because Copilot uses that shortcut when Alpaquitay is not installed.")

Every command is also in the Command Palette (<kbd>F1</kbd>) under the **Alpaquitay AI:** prefix.

## The Hub at a glance

The Hub is a single editor tab with six sections. Top right, you pick the active model and open the configuration (⚙).

![The Hub with the Work tab: spec, board and chat](media/hub-work.png "The Work tab: the spec on the left, the Kanban board in the middle and the chat on the right.")

| Tab | What it is for | Chapter |
|---|---|---|
| **Work** | The spec (`spec.md`), the Kanban board and the chat with the harness. | [Work](../work/) |
| **Docs** | Edit and analyse Word, Markdown, EPUB and PDF documents with an agent. | [Docs](../docs/) |
| **Evidence** | Repository signals, agentic debt, review queue, traceable history, routes and privacy. | [Evidence](../evidence/) |
| **Architecture** | An architecture canvas inferred from the project, ADRs, AI assessment and IaC export. | [Architecture](../architecture/) |
| **Agents** | Built-in skills and your own. | [Agents](../agents/) |
| **Settings** | Provider, model, limits, system prompt, tools and spec file. | [Providers](../providers/), [Reference](../reference/) |

Below the tabs, the **harness strip** sums up the state: workspace folder, detected stack, debt (`0/100`), diffs waiting for review and privacy mode.

## Your first session, step by step

1. **Open a project folder** in VS Code (*File → Open Folder*). It can be a new project or a legacy one.
2. **Connect a provider.** The quickest private option is [Ollama](https://ollama.com): install it and run `ollama pull qwen2.5-coder` (or any model). Alpaquitay finds it on its own at `http://localhost:11434`. More options in [chapter 2](../providers/).
3. **Open the Hub** with <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd>.
4. **Type `onboard` in the chat** of the Work tab. It is free (no model call): it analyses the project, detects the build and test commands, writes a first ADR and computes the DORA signals. See [Chat commands](../chat-commands/#onboard).
5. **Create your spec** with *+ Create with AI* in the *Spec* pane, or with the *Generate Specification (Local Model)* command if nothing may leave your machine.
6. **Drag a task to *In Progress*** and review the diff it proposes. Type `si aplicar` to write it or `no` to discard it.

> [!TIP]
> If no provider is configured, the chat says so: *«No hay proveedor AI disponible. Configura uno en ⚙ o inicia Ollama/LM Studio.»* (no AI provider available; configure one or start Ollama/LM Studio). The harness commands that use no model (`dora`, `deuda`, `economía`, `postmortem`) also need an active provider in this version, because they are typed in the same chat.

## What is created in your project

Alpaquitay only writes inside your workspace folder, and almost everything inside `.alpaquitay/`:

| File | Content |
|---|---|
| `spec.md` | Your spec: epics and tasks. It is the board's source of truth. |
| `.alpaquitay/decisions.jsonl` | One line per harness decision: route, lane, confidence and reasons. |
| `.alpaquitay/debt.json` | The agentic debt meter and its latest events. |
| `.alpaquitay/economy.json` | Model calls versus free local operations. |
| `.alpaquitay/fingerprint.json`, `platform.json` | The detected stack and the build and test commands. |
| `.alpaquitay/ADR-001-onboard.md`, `.alpaquitay/adrs/` | Architecture decision records. |
| `.alpaquitay/memory.json` | Hierarchical project memory (classes, functions, completed tasks). |
| `.alpaquitay/ideas.json` | The inbox of ideas that are not tasks yet. |

You decide whether to commit `.alpaquitay/`: sharing it gives the team the same decision history; ignoring it keeps it personal.

## Uninstall

Uninstall from the Extensions view. The `.alpaquitay/` folder and `spec.md` stay in your project (they are yours); delete them by hand if you do not want them. If you used the local engine, first run **Alpaquitay AI: Clear Local Model Cache** to free the space of the downloaded model.
