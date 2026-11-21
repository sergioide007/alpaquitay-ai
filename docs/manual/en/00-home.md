---
title: Alpaquitay AI manual
nav: Home
slug:
description: User manual for Alpaquitay AI for VS Code: installation, AI providers, specs and board, document agent, evidence, architecture, the WebGPU local engine, use cases and videos.
---

# Alpaquitay AI manual

Alpaquitay AI is a free, open-source (MIT) extension for Visual Studio Code. It puts a **harness** between your intent and your code: it picks the right route for each request, shows you every change as a *diff* before writing it, checks the gates of the software lifecycle and keeps a local record of what happened. You can use it with models on your own machine (Ollama, LM Studio or its WebGPU local engine) or with Anthropic and OpenAI.

This manual explains how to use each part, what it is good for and what it guarantees, with screenshots and videos of the real extension.

```video
title: A tour of the Hub
src: media/tour-en.mp4
poster: media/tour-en.jpg
duration: 0:44
caption: The Hub opens with `Ctrl+Alt+A`; the video walks through its six tabs: Work, Docs, Evidence, Architecture, Agents and Settings.
```

> [!NOTE]
> Some messages inside the extension are in Spanish (for example the download confirmation and the progress notifications of the local engine). This manual quotes them as they appear and translates them.

## Where to start

<ul class="cards">
<li><a href="installation/"><strong>1 · Install and open the Hub</strong><span>Marketplace or Open VSX, the two shortcuts and your first session.</span></a></li>
<li><a href="providers/"><strong>2 · Choose an AI provider</strong><span>Local and private (Ollama, LM Studio, local engine) or in the cloud.</span></a></li>
<li><a href="work/"><strong>3 · Work from a spec</strong><span>From <code>spec.md</code> to the board, and from the board to a reviewed change.</span></a></li>
<li><a href="local-engine/"><strong>4 · AI on your own machine</strong><span>Generate specs with WebGPU without sending your text to any server.</span></a></li>
<li><a href="use-cases/"><strong>5 · Step-by-step use cases</strong><span>Legacy project, new project, a book, architecture and more.</span></a></li>
<li><a href="models/"><strong>6 · Available models</strong><span>Live status of the signed models of the local engine.</span></a></li>
</ul>

## What Alpaquitay does, in one table

| You need to… | Use | Chapter |
|---|---|---|
| Turn an idea into epics and tasks | **Work** tab → *Create with AI*, or the *Generate Specification (Local Model)* command | [Work](work/), [Local engine](local-engine/) |
| Let the AI implement a task without writing blindly | Drag the card to **In Progress**, review the diff, `si aplicar` | [Work](work/) |
| Know the real state of the repository | `onboard`, `dora`, `deuda` in the chat; the **Evidence** tab | [Chat commands](chat-commands/), [Evidence](evidence/) |
| Proofread, translate or review a manuscript | The **Docs** tab (Word, Markdown, EPUB, PDF) | [Docs](docs/) |
| See and document the architecture | The **Architecture** tab: inference, ADRs, assessment, IaC export | [Architecture](architecture/) |
| An expert opinion (security, QA, DevOps, cloud…) | Ask in the chat; the harness picks a specialist | [Agents](agents/) |
| Work without your code leaving your machine | Ollama, LM Studio or the local engine | [Providers](providers/) |

## How this manual is organised

- **Chapters 1 to 3:** installation, providers and how the harness thinks. Read them in order the first time.
- **Chapters 4 to 10:** one tab or feature per chapter. Jump to the one you need.
- **Chapters 11 to 16:** models, recipes, diagrams, reference, troubleshooting and how to contribute.

Search any topic with <kbd>Ctrl</kbd>+<kbd>K</kbd> (or <kbd>/</kbd>). Every page ends with a link to suggest improvements on GitHub: this manual belongs to the community. There is also a [Spanish version](../).

> [!NOTE]
> The manual describes version **3.8.2**. It includes the **Changes** tab for following agent progress and reviewing file diffs, with actions to review and apply or discard pending changes. It also covers the Qwen 2.5 local provider with WebGPU, *Generate Specification (Local Model)* and the models page.

## Principles you will see everywhere

1. **Nothing is written without you seeing it.** In the Hub, every code change first arrives as a bounded *diff*, and writing needs your `si aplicar`. (The exception is the classic *Generate from Spec* command, which writes directly; see [Work](work/#generate-from-spec-and-validate-against-spec).)
2. **Evidence before autonomy.** Code tasks move to *Done* only with no pending diffs, an `onboard`-verified platform contract and green build/test evidence. Docs-only projects need no contract or build/test evidence, but pending diffs still block *Done*.
3. **Privacy by architecture.** There is no Alpaquitay intermediary server. Local models never leave your machine; cloud calls go straight to your provider after passing a privacy boundary that hides personal data and secrets.
4. **Everything is recorded in your repository**, in the `.alpaquitay/` folder: decisions, debt, session economy, project memory and ADRs.
