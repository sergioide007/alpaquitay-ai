# Alpaquitay AI

> **Spec-Driven Development inside VS Code — one panel, five tabs, AI that works autonomously on your backlog.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.85.0-blue)](https://github.com/sergioide007/alpaquitay-ai/releases)
[![Version](https://img.shields.io/badge/version-2.0.0-green)](./CHANGELOG.md)
[![Marketplace](https://img.shields.io/badge/Marketplace-coming%20soon-orange)](https://marketplace.visualstudio.com/items?itemName=alpaquitay-ai.alpaquitay-ai)
[![Open Source](https://img.shields.io/badge/Open%20Source-%E2%9D%A4-red)](./LICENSE)
[![Website](https://img.shields.io/badge/Website-specsolid.com-blueviolet)](https://www.specsolid.com)

![Alpaquitay AI — 5-tab panel: Spec, Board, Chat, Git, Settings](https://raw.githubusercontent.com/sergioide007/alpaquitay-ai/main/media/demo-hub.gif)

---

## What is Alpaquitay AI?

Alpaquitay AI turns your VS Code into a complete Spec-Driven Development environment. Instead of context-switching between chat windows, Jira boards, GitHub, and your IDE, everything lives in **one panel**: a `spec.md` file that defines your project, a Kanban board that tracks progress, an AI that implements tasks autonomously, and a git history that connects commits to requirements.

The central concept is **SDD (Spec-Driven Development)**: `spec.md` is the single source of truth. The AI reads it, works from it, updates it, and every commit references it.

**100% open source · MIT license · Privacy-first** — your code and prompts go directly to your chosen AI provider. No Alpaquitay servers exist.

**Website:** [specsolid.com](https://www.specsolid.com)

---

## Core SDD Workflow

![SDD workflow — drag card to In Progress, AI codes, task moves to Done](https://raw.githubusercontent.com/sergioide007/alpaquitay-ai/main/media/demo-sdd.gif)

```
  spec.md ──► Kanban Board ──► AI implements task ──► spec.md [x] ──► git #SPEC-XXX
     ▲                                                        │
     └────────────────────────────────────────────────────────┘
                          feedback loop
```

1. Write (or AI-generate) a `spec.md` with epics and tasks
2. Drag a task card to **In Progress** on the board
3. The AI scans the workspace, plans which files to create, and writes the code
4. The task auto-moves to **Done** and `spec.md` is updated (`- [x]`)
5. Git commits reference `#SPEC-001` — every change is traceable to a requirement

---

## Architecture

### Extension Host Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            VS Code Extension Host                               │
│                                                                                 │
│  ┌──────────────┐    activates     ┌──────────────────────────────────────────┐ │
│  │ extension.ts │─────────────────►│           MainPanel (WebviewPanel SPA)   │ │
│  │              │                  │                                          │ │
│  │  - Commands  │   postMessage    │  ┌──────────┐ ┌───────┐ ┌─────────────┐  │ │
│  │  - Keybinds  │◄────────────────►│  │  Studio  │ │ Arch  │ │Git/Skills/  │  │ │
│  │  - Secrets   │                  │  │ (3-col)  │ │Canvas │ │  Settings   │  │ │
│  └──────┬───────┘                  │  └──────────┘ └───────┘ └─────────────┘  │ │
│         │                          └──────────────────────────────────────────┘ │
│         │                                           ▲ message bus               │
│  ┌──────▼───────────────────────────────────────┐   │                           │
│  │               Core Services                  │───┘                           │
│  │                                              │                               │
│  │  AIProviderManager ──► [active provider]     │                               │
│  │       ├── AnthropicProvider (claude-*)       │                               │
│  │       ├── OpenAIProvider    (gpt-4o / o1)    │                               │
│  │       ├── OllamaProvider   (local, free)     │                               │
│  │       └── LMStudioProvider (local, free)     │                               │
│  │                                              │                               │
│  │  SpecManager ──► spec.md (read/write/parse)  │                               │
│  │  GitIntegration ──► git log + #SPEC links    │                               │
│  │  HierarchicalMemory ──► .alpaquitay/         │                               │
│  │  ProjectContextBuilder ──► stack detection   │                               │
│  │  SecretManager ──► OS keychain (no plaintext)│                               │
│  └──────────────────────────────────────────────┘                               │
│                                                                                 │
│  ┌──────────────────────────────────────────────┐                               │
│  │             MCP Tool Layer                   │                               │
│  │  MCPManager ──► FilesystemMCP (read/write)   │                               │
│  │             └── GitMCP       (log/status)    │                               │
│  └──────────────────────────────────────────────┘                               │
│                                                                                 │
│  ┌──────────────────────────────────────────────┐                               │
│  │            Skill Pipeline                    │                               │
│  │  SkillRegistry                               │                               │
│  │    ├── CreateFileSkill                       │                               │
│  │    ├── RefactorSkill                         │                               │
│  │    ├── GenerateTestsSkill                    │                               │
│  │    ├── ProjectBuilderSkill (DeepAgent)       │                               │
│  │    ├── GenerateFromSpecSkill (DeepAgent)     │                               │
│  │    ├── ValidateAgainstSpecSkill              │                               │
│  │    ├── NewSpecificationSkill                 │                               │
│  │    ├── DailyStandupSkill                     │                               │
│  │    └── Custom skills (runtime-registered)    │                               │
│  └──────────────────────────────────────────────┘                               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### SDD Task Execution Pipeline — Deferred Quality Architecture

```
User drags card to "In Progress"
            │
            ▼
   _handleTaskStatus()
            │
            ▼
  First time? ──No──► ask for correction text
            │                   │
           Yes                  ▼
            │          _handleTaskCorrection()
            ▼                   │
   _startTaskWork()  ◄──────────┘
            │
            ├─── Phase 1: PLAN ──────────────────────────────────────────────────
            │    AI prompt: "Task: {title}. List relative file paths to create."
            │    maxTokens: 150   (tightly scoped — paths only)
            │    Retry once if AI returns prose instead of paths
            │
            ├─── Phase 2: GENERATE + WRITE ─────────────────────────────────────
            │    For each file path (max 6):
            │      - Skip if path == spec.md (protected)
            │      - Build prompt: masterPrompt + epic context + file description
            │      - AI generates code (maxTokens: 1024)
            │      - FilesystemMCP.write_file(path, content)
            │      - HierarchicalMemory.extractFromCode(path, content)
            │      - Queue format + validate as background task (non-blocking)
            │
            ├─── Phase 3: FAST KANBAN COMPLETION ◄── KEY OPTIMIZATION ──────────
            │    ● setBoardStatus('done')  — in-memory, instant
            │    ● patch specData in cache — no file re-read
            │    ● post spec-data         — board moves to Done ✓
            │    ● post task-work-done    — Kanban card updates ✓
            │    ● post chat-done         — chat spinner stops ✓
            │    ─────────────────────────────────────────────
            │    Total time to Done: ~AI generation time only
            │    (typically 3-15 s depending on model + files)
            │
            └─── Phase 4: BACKGROUND QUALITY PIPELINE (fire-and-forget) ────────
                 Runs after Kanban is already Done — never blocks the board
                 ● Promise.allSettled(qualityTasks)     format each file
                   └── _formatGeneratedFile(abs)        LSP formatter
                   └── _validateAndFixFile(abs)         diagnostics + AI fix
                       └── _waitForDiagnostics(uri)     fast-exit if no errors
                 ● _runBuildAndTests()                  build + test commands
                 ● HierarchicalMemory.save()            persist context
                 ● SpecManager.updateTaskDone(task)     write [x] to spec.md
                 Results stream to chat panel as chat-chunk messages
```

#### Performance Gains

| Step | Before (v2.0) | After (v2.1) | Savings |
|------|--------------|--------------|---------|
| Diagnostics wait per file | 8 000 ms (blocking) | 0 ms (background) | **8 s/file** |
| Build command | 0–90 000 ms (blocking) | 0 ms (background) | **up to 90 s** |
| spec.md re-read after done | ~500 ms (extra read) | 0 ms (cache patch) | ~500 ms |
| **Kanban card → Done** | **20–120 s** | **≈ AI gen time** | **>95%** |

The AI generation time (Phase 1 + 2) is the irreducible cost: it depends on model speed and number of files. Quality validation, formatting, and builds continue in the background and their results appear in the chat panel.

### Clean Architecture Project Generation

When `ProjectBuilderSkill` runs, it detects the stack and applies the correct canonical structure:

```
Goal text ──► detectStyleFromGoal() ──► ArchitecturalStyle
                                               │
                              ┌────────────────┼────────────────┐
                              ▼                ▼                ▼
                         java-maven      spring-fullstack    react-clean
                         java-gradle        (monorepo)       (+ others)

Java (Clean Architecture — Robert C. Martin):
┌─────────────────────────────────────────────────────────────┐
│  src/main/java/com/company/project/                         │
│  ├── domain/                                                │
│  │   ├── model/        ← Pure Java POJOs (no @Entity)       │
│  │   └── port/         ← Repository/service interfaces      │
│  ├── application/                                           │
│  │   ├── service/      ← Use cases (@Service, no HTTP/JPA)  │
│  │   └── dto/          ← Request/response DTOs              │
│  ├── infrastructure/                                        │
│  │   ├── persistence/  ← @Entity + Spring Data JPA impls    │
│  │   ├── web/rest/     ← @RestController (thin HTTP layer)  │
│  │   └── config/       ← Security, CORS, Swagger            │
│  └── shared/                                                │
│      └── exception/    ← @ControllerAdvice + custom errors  │
│                                                             │
│  Dependency rule: infrastructure → application → domain     │
└─────────────────────────────────────────────────────────────┘

React (Clean Architecture / ISO 12207):
┌─────────────────────────────────────────────────────────────┐
│  src/                                                       │
│  ├── domain/                                                │
│  │   ├── model/        ← TypeScript types (no React/axios)  │
│  │   └── service/      ← Pure domain logic                  │
│  ├── application/                                           │
│  │   ├── use-case/     ← Business use cases                 │
│  │   └── store/        ← Zustand/Redux slices               │
│  ├── infrastructure/                                        │
│  │   ├── api/          ← Axios adapters (all HTTP here)     │
│  │   └── storage/      ← localStorage adapters              │
│  └── presentation/                                          │
│      ├── components/   ← Reusable UI components             │
│      ├── pages/        ← Route-level pages                  │
│      └── layout/       ← Layout wrappers                    │
└─────────────────────────────────────────────────────────────┘
```

### AI Provider Chain

```
User selects model or sends chat
            │
            ▼
   AIProviderManager.getActive()
            │
    preferred provider set? ──No──► try Ollama → LM Studio → Anthropic → OpenAI
            │                              (first available wins)
           Yes
            │
            ▼
   provider.chat(messages, options)
            │
     ┌──────┴───────────────────────────────────────────┐
     │                                                  │
     ▼                                                  ▼
AnthropicProvider                              OllamaProvider
  POST /v1/messages                              POST /api/chat
  model: claude-sonnet-4-6                       model: codellama
  max_tokens: cfg.maxTokens                      num_predict: cfg.maxTokens
  stream: true                                   stream: true
     │                                                  │
     └──────────────────┬───────────────────────────────┘
                        ▼
              SSE chunks → webview chat-chunk events
              Final response → chat-done event
```

### Architecture Diagram Module (Arch Tab)

```
User places nodes on SVG canvas
            │
            ▼
  S.arch = { nodes: ArchNode[], edges: ArchEdge[] }
            │
  arch-save ──► _handleArchSave() ──► .alpaquitay/arch.json
  arch-load ──► _handleArchLoad() ──► reads .alpaquitay/arch.json
  arch-export ──► _handleArchExport(diagram, format)
                        │
              ┌─────────┼─────────┬─────────────┐
              ▼         ▼         ▼             ▼
          Terraform  AWS CDK   Azure Bicep   GCP YAML
           (AWS)    (TypeScript)  (.bicep)   (.yaml)
```

---

## Quick Start

### Step 1 — Install

Download the `.vsix` file from [GitHub Releases](https://github.com/sergioide007/alpaquitay-ai/releases), then run:

```bash
code --install-extension alpaquitay-ai-2.0.0.vsix
```

> **Marketplace:** Publishing to the VS Code Marketplace is coming soon. Once live, installation will be:
> `code --install-extension alpaquitay-ai.alpaquitay-ai`
> or by searching **"Alpaquitay AI"** in the Extensions panel.

### Step 2 — Configure a provider

![Configuring an AI provider — local Ollama or cloud API key](https://raw.githubusercontent.com/sergioide007/alpaquitay-ai/main/media/demo-providers.gif)

**Local (free, fully private):**

```bash
# Ollama — auto-detected at http://localhost:11434
ollama pull codellama
# Other options: llama3, mistral, qwen2.5-coder, deepseek-coder

# LM Studio — auto-detected at http://localhost:1234
# Load any GGUF model inside LM Studio, then start the local server
```

**Cloud (Anthropic / OpenAI):**

Open the command menu with `Ctrl+Shift+A` → select **Configure AI Provider** → enter your API key.
Keys are stored in the OS keychain via VS Code SecretStorage — never in plaintext, never in settings files.

> **Small model note:** Models under ~4B parameters (`1.3b`, `3b`, `mini`, `nano`, `gemma:2b`, etc.) are detected automatically. Stricter no-comment rules are injected and generation temperature is lowered so they produce cleaner output.

### Step 3 — Open the hub

```
Ctrl+Shift+A   →  Command menu (choose hub or other commands)
Ctrl+Alt+A     →  Open Alpaquitay Hub directly
```

### Step 4 — Create your spec

In the **Studio** tab → **Spec** pane → click **Generate with AI**. The AI analyzes your workspace and creates an initial `spec.md` with epics and tasks. Refine it by hand or via the chat pane.

### Step 5 — Work tasks

On the **Board** pane, all tasks start in **Backlog**. Drag one to **In Progress** — the AI immediately starts implementing it and streams progress to the **Chat** pane.

---

## spec.md Format

Standard Markdown with checkboxes. Level-2 headings define epics; checkboxes define tasks.

```markdown
# My Project

Brief description.

## Epic: Authentication

- [ ] SPEC-001 Implement JWT provider
- [ ] SPEC-002 Add refresh token rotation
- [x] SPEC-003 Design auth flow

## Epic: Dashboard

- [ ] SPEC-004 Build metrics chart component
- [ ] SPEC-005 Add CSV export
```

**Rules:**
- `## Heading` → epic group
- `- [ ] text` → pending task
- `- [x] text` → completed task
- Task IDs (`SPEC-001`, `SPEC-002`, ...) are auto-assigned by position
- Free-form text between tasks is used as AI context

---

## Git Convention

Reference a spec task in your commit message to link it in the Git tab:

```
feat(auth): implement JWT provider #SPEC-001

Handles token generation, expiry, and validation. Uses RS256.
```

Both `#SPEC-001` and `[SPEC: 001]` formats are recognized. The Git tab shows a badge on that commit.

---

## AI Providers

| Provider | Type | Privacy | Cost | Setup |
|---|---|---|---|---|
| Ollama | Local | 100% on-device | Free | `ollama pull <model>` |
| LM Studio | Local | 100% on-device | Free | Load model, start server |
| Anthropic Claude | Cloud | Direct API | API pricing | API key in keychain |
| OpenAI GPT | Cloud | Direct API | API pricing | API key in keychain |

### Anthropic Models

| Model | Context | Max Output | Best for |
|---|---|---|---|
| Claude Opus 4.7 | 200k | 32k | Complex architecture, reasoning |
| Claude Sonnet 4.6 | 200k | 64k | Balanced — default recommendation |
| Claude Haiku 4.5 | 200k | 8k | Fast iteration, simple tasks |

### OpenAI Models

| Model | Context | Max Output | Best for |
|---|---|---|---|
| GPT-4o | 128k | 16k | General coding, balanced |
| GPT-4o Mini | 128k | 16k | Fast, cost-effective |
| GPT-4 Turbo | 128k | 4k | Legacy compatibility |
| o1 | 200k | 32k | Multi-step reasoning |
| o1-mini | 128k | 65k | Reasoning at lower cost |

---

## Skills

### Built-in Skills

| ID | Name | Description |
|---|---|---|
| `create-file` | Create File | Generates a new source file from a description |
| `refactor` | Refactor Code | Applies SOLID principles and clean code patterns |
| `generate-tests` | Generate Tests | Writes unit tests for the active file |
| `generate-from-spec` | Generate from Spec | DeepAgent: reads spec, plans files, generates all |
| `validate-against-spec` | Validate vs Spec | Checks implementation matches the spec |
| `new-specification` | New Specification | Creates a new spec.md from a template |
| `project-builder` | Project Builder | Scaffolds a full project from a goal description |
| `daily-standup` | Daily Standup | Standup summary from recent git commits |

### Custom Skills (TypeScript)

```typescript
import { Skill, SkillContext, SkillResult } from './core/interfaces';

export class DocumentationSkill implements Skill {
  readonly id = 'generate-docs';
  readonly name = 'Generate Docs';
  readonly description = 'Write JSDoc for all exported functions';

  async execute(ctx: SkillContext): Promise<SkillResult> {
    const { path } = ctx.parameters as { path: string };
    const file = await ctx.mcp.executeTool('filesystem', 'read_file', { path }) as { content: string };
    const documented = await ctx.ai.complete(
      `Add complete JSDoc to all exported functions.\n\n${file.content}\n\nReturn only the updated file.`
    );
    await ctx.mcp.executeTool('filesystem', 'write_file', { path, content: documented });
    return { success: true, output: { path } };
  }
}
```

### DeepAgent Multi-Step Skills

```typescript
// Each step's output is available to all subsequent steps
const steps: AgentStep[] = [
  { name: 'detect-context', async run(ctx)           { return detectStack(ctx); } },
  { name: 'plan-files',     async run(ctx, outputs)  { return planFiles(ctx, outputs['detect-context']); } },
  { name: 'generate-files', async run(ctx, outputs)  { return generateFiles(ctx, outputs['plan-files']); } },
];
export const MySkill = new DeepAgentSkill('my-skill', 'My Skill', 'Description', steps);
```

---

## Hierarchical Memory

Alpaquitay maintains a **hierarchical project memory** in `.alpaquitay/memory.json`. As the AI generates code, it automatically records:

| Level | What is stored |
|---|---|
| `project` | Name, description, architecture decisions |
| `component` | Major subsystems (auth, dashboard, API layer) |
| `module` | Specific modules within a component |
| `feature` | Completed spec tasks with their output files |
| `class` | Class names and which file they live in |
| `method` | Top-level exported functions |
| `package` | External packages and why they were chosen |
| `config` | Configuration entries |

This memory persists across sessions. Future tasks can query it to maintain consistency — e.g., knowing that `UserService` is in `src/services/user.ts` before generating a file that imports it.

---

## Supported Project Architectures

Alpaquitay auto-detects the stack from project files and generates architecture-specific prompts and directory structures.

| Style | Detection | Structure | Architecture Pattern |
|---|---|---|---|
| `react-spa` | `package.json` (react) | src/components, pages | Functional + Hooks |
| `react-clean` | goal text | domain/application/infrastructure/presentation | Clean Architecture |
| `react-node` | `package.json` (react+express) | client/ + server/ | MVC full-stack |
| `nextjs` | `package.json` (next) | app/ (App Router) | Server + Client components |
| `vue-spa` | `package.json` (vue) | src/components, views | Composition API + Pinia |
| `angular` | `angular.json` | src/app/ | Standalone components + NgRx |
| `express-api` | `package.json` (express) | routes/controllers/services | REST MVC |
| `java-maven` | `pom.xml` | domain/application/infrastructure/shared | **Clean Architecture** |
| `java-gradle` | `build.gradle` | domain/application/infrastructure/shared | **Clean Architecture** |
| `spring-fullstack` | goal text | backend/ + frontend/ (monorepo) | CA backend + CA frontend |
| `csharp-webapi` | `*.csproj` | Controllers/Services/Models | Minimal API / MVC |
| `go-api` | `go.mod` | cmd/internal/pkg | Effective Go |
| `django` | `requirements.txt` | apps/ pattern | DRF ViewSets + ModelSerializer |
| `flask` | `requirements.txt` | blueprints/ | Application factory |
| `python-package` | `pyproject.toml` | package/__init__.py | PEP 517 |
| `react-native` | `package.json` (expo) | src/screens/components | React Navigation |

All Java projects follow **Clean Architecture** (Robert C. Martin) with strict dependency inversion: `infrastructure → application → domain`.

---

## Commands & Shortcuts

| Command | Shortcut | Description |
|---|---|---|
| `Alpaquitay AI: Open Hub` | `Ctrl+Alt+A` | Open the unified panel |
| `Alpaquitay AI: Show Menu` | `Ctrl+Shift+A` | Quick menu with all commands |
| `Alpaquitay AI: New Specification` | — | Create a spec from a template |
| `Alpaquitay AI: Generate from Spec` | — | AI generates code from a selected spec |
| `Alpaquitay AI: Validate Against Spec` | — | Check implementation vs spec |
| `Alpaquitay AI: Configure AI Provider` | — | Set API key or local endpoint |

> `Ctrl+Shift+A` shows a popup menu so it does not conflict with GitHub Copilot's agent menu, which uses the same shortcut when Alpaquitay is not installed.

---

## Settings Reference

All settings are configurable in VS Code's settings UI or `settings.json`. Provider-specific settings can also be changed from the **Settings** tab inside the hub.

| Setting | Default | Description |
|---|---|---|
| `alpaquitay-ai.preferredProvider` | `auto` | `auto` tries local first, then cloud |
| `alpaquitay-ai.anthropic.model` | `claude-sonnet-4-6` | Anthropic model ID |
| `alpaquitay-ai.anthropic.baseUrl` | Anthropic API | Override for proxies or compatible APIs |
| `alpaquitay-ai.openai.model` | `gpt-4o` | OpenAI model ID |
| `alpaquitay-ai.openai.baseUrl` | OpenAI API | Override for Azure OpenAI |
| `alpaquitay-ai.ollama.endpoint` | `http://localhost:11434` | Ollama server address |
| `alpaquitay-ai.ollama.model` | `codellama` | Ollama model name |
| `alpaquitay-ai.lmstudio.endpoint` | `http://localhost:1234` | LM Studio server address |
| `alpaquitay-ai.maxTokens` | `4096` | Default max tokens per request |
| `alpaquitay-ai.temperature` | `0.3` | 0 = deterministic, 2 = creative |
| `alpaquitay-ai.requestTimeout` | `120000` | Request timeout in ms |
| `alpaquitay-ai.specFile` | `spec.md` | Spec filename in workspace root |
| `alpaquitay-ai.skill.maxParallel` | `3` | Max concurrent parallel skills |
| `alpaquitay-ai.mcp.filesystem.enabled` | `true` | Enable filesystem read/write tool |
| `alpaquitay-ai.mcp.git.enabled` | `true` | Enable git log tool |

---

## Key Design Decisions

**spec.md as the database.** Board state is derived from the spec file, never stored separately. Git diffs are human-readable; there is no sync problem between board and file.

**MCP as the tool layer.** The AI does not call VS Code APIs directly. It invokes tools (`filesystem.read_file`, `filesystem.write_file`) through a typed MCP executor, making skills unit-testable outside VS Code.

**Small model awareness.** Models under ~4B parameters are detected by name pattern. They receive stripped-down system prompts (no epic context, no masterPrompt), zero-comment rules, and post-processing strips any narration comments they emit despite the instructions.

**Hierarchical memory.** After each code generation, class names, exported functions, and completed feature records are extracted and stored. This builds a growing project index that keeps multi-session AI context coherent.

**Single WebviewPanel SPA.** Everything in one editor tab. The webview is vanilla TypeScript-compiled HTML — no React, no bundler, fast startup, no dependency on frontend tooling in the workspace.

**Fire-and-forget task engine.** `_startTaskWork()` runs asynchronously and streams progress to the webview via `chat-chunk` events. If the AI call fails, the error appears in Chat and the card reverts — no silent failures.

**spec.md protection.** During task work, if the AI tries to write to `spec.md` (its source of truth), the write is silently skipped. This prevents the AI from accidentally erasing all task checkboxes.

---

## Domain Agent Architecture — The Architecture to Win a Vertical

> *Stop building better prompts. Build autonomous agents that own entire workflows end-to-end.*

Every industry will have an AI agent winner. The winner won't be the one with the best LLM — it will be the one who knows the **domain's edge cases better than anyone else**. The LLM is commodity. The moat is in the domain layer: the tool integrations, the compliance rules, the institutional knowledge encoded as structured prompts and validation guardrails.

Alpaquitay's agent engine already embodies the loop:

```
Objective → Decompose → Domain Tools → Validate → Done
```

A **Domain Agent Shell** wraps this engine in a vertical-specific layer and connects it to the real APIs, databases, and compliance rules of a particular industry.

### The Architecture to Win a Vertical

```
┌──────────────────────────────────────────────────────┐
│                 DOMAIN AGENT SHELL                   │
│                                                      │
│  ┌───────────────────┐  ┌────────────────────────┐   │
│  │ Process           │  │ Domain Tools           │   │
│  │ Definition        │  │ (Real APIs / ERPs)     │   │
│  │ (replaces spec.md)│  │                        │   │
│  └───────────────────┘  └────────────────────────┘   │
│                                                      │
│  ┌───────────────────────────────────────────────┐   │
│  │          ALPAQUITAY AGENT ENGINE              │   │
│  │    decompose  →  execute  →  validate         │   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
│  ┌───────────────────┐  ┌────────────────────────┐   │
│  │ Domain Memory     │  │ Compliance Guardrails  │   │
│  │ (persistent ctx)  │  │ (domain-specific rules)│   │
│  └───────────────────┘  └────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

| Layer | Alpaquitay Dev Tool | Domain Agent Shell |
|---|---|---|
| Objective | `spec.md` | Process Definition (SOP / BPMN) |
| Decomposition | Kanban tasks | Domain workflow steps |
| Tools | filesystem, git MCP | Industry APIs (ERP, CRM, TMS, legal DB) |
| Validation | build + diagnostics | Business rules + compliance guardrails |
| Memory | `HierarchicalMemory` | Domain-scoped learner/case/patient context |

---

### Architectural Foundations

#### ISO Industry Standards

Each vertical domain is anchored to its governing ISO standard so the agent's process definition is traceable to real-world compliance requirements:

| Domain | Primary ISO / Standard | Key Compliance Concern |
|---|---|---|
| **English Learning** ✅ | CEFR · ISO 17024 · ISO 21001 | Competency assessment validity |
| **Software Engineer** ✅ | ISO/IEC 25010 · 12207 · SOLID | Code quality, maintainability |
| **Software Architect** ✅ | ISO/IEC 42010 · TOGAF · C4 | Architecture decision traceability |
| **Developer** ✅ | ISO/IEC 12207 · Clean Code | Implementation quality |
| **QA** ✅ | ISO/IEC 29119 · IEEE 829 | Test coverage, defect severity |
| **DevOps** ✅ | DORA Metrics · ISO/IEC 27001 | Deployment frequency, MTTR |
| **DevSecOps** ✅ | OWASP SAMM · ISO/IEC 27001 | Shift-left security maturity |
| **Security** ✅ | NIST CSF · ISO/IEC 27001/27005 | Risk classification, incident response |
| **Infrastructure** ✅ | ISO/IEC 27001 · ITIL v4 | Availability, capacity planning |
| **Cloud (AWS/Azure/GCP)** ✅ | AWS WAF · ISO/IEC 27017 | Well-architected, cost optimisation |
| **Marketing** ✅ | ISO 9001 · IAB Standards | Campaign attribution, ROI |
| **Process** ✅ | ISO 9001 · BPM CBOK · Six Sigma | Process efficiency, compliance |
| **AI Expert** ✅ | ISO/IEC 42001 · EU AI Act · NIST AI RMF | AI governance, risk classification |
| **Business** ✅ | ISO 56002 · OKR · BMC | Business model viability, runway |
| Finance | ISO 20022 · BIAN Banking Standards | Transaction integrity, audit trail |
| Legal | ISO/IEC 27001 · GDPR (Regulation) | Data sovereignty, chain of custody |
| Logistics | ISO 9001 · GS1 Standards | Traceability, SLA adherence |
| Recruiting | ISO 30405 (Human resource management) | Bias-free assessment, GDPR |
| Healthcare | ISO 13485 · HL7 FHIR | Patient safety, data accuracy |

#### TOGAF ADM Alignment

Each Domain Agent Shell is architected through TOGAF's Architecture Development Method phases:

```
Phase B — Business Architecture    : Domain process model (BPMN / ArchiMate Motivation)
Phase C — Application Architecture : Use cases, ports, adapters (Hexagonal)
Phase D — Technology Architecture  : AI provider, storage, external APIs
Phase E — Opportunities & Solutions: Compliance guardrails, risk mitigation
Phase F — Migration Planning       : Version-controlled domain memory
```

#### ArchiMate 3.2 Notation

```
Business Layer   : Business Process ──► Business Service (domain workflow)
Application Layer: Application Service ──► Application Component (use cases)
                   Application Interface (primary ports exposed to callers)
                   Application Interface (secondary ports to infrastructure)
Technology Layer : Technology Service (AI Provider, Storage, APIs)
```

#### BIAN Service Domain Pattern

Each Domain Agent Shell maps to a BIAN Service Domain:
- **English**: Learning Progress · Competency Assessment · Content Generation
- **Software Engineer**: Code Quality Assessment · Technical Debt Management · Pattern Advisory
- **Software Architect**: Architecture Decision Record · Quality Attribute Evaluation · Tech Radar
- **Developer**: Feature Implementation · Debug Assistance · Code Explanation
- **QA**: Test Planning · Defect Triage · Quality Gate Definition
- **DevOps**: CI/CD Pipeline Design · DORA Assessment · Infrastructure-as-Code Generation
- **DevSecOps**: Secure Pipeline Design · Threat Modelling · SBOM Generation · SAMM Assessment
- **Security**: Compliance Audit · Penetration Test Planning · Risk Register · Incident Response
- **Infrastructure**: Capacity Planning · Network Design · DR Planning · SLA Definition
- **Cloud**: Well-Architected Review · Cost Optimisation · Cloud Migration Planning
- **Marketing**: Campaign Planning · Audience Segmentation · SEO Analysis · ROI Measurement
- **Process**: Process Mapping · Gap Analysis · Value Stream Mapping · ISO Compliance
- **AI Expert**: LLM Evaluation · RAG Architecture · Prompt Engineering · AI Governance
- **Business**: Business Model Canvas · OKR Definition · Financial Model · Market Analysis
- **Finance**: Payment Order · Credit Assessment · Regulatory Reporting
- **Legal**: Contract Review · Compliance Monitoring · Document Classification
- **Logistics**: Shipment Tracking · Route Optimization · Carrier Management

---

### 4+1 Architectural Views

#### 1. Logical View — Domain Model
Pure domain objects with zero framework imports. Entities, value objects, and aggregate roots define the business language of the vertical.

#### 2. Development View — Hexagonal Package Structure
```
src/domains/
  interfaces/           ← DomainAgentShell (base contract for all shells)
  {vertical}/
    domain/             ← Pure model (entities, value objects)
    ports/
      input.ts          ← Primary ports (driving) — what callers invoke
      output.ts         ← Secondary ports (driven) — what infra implements
    application/        ← Use cases (orchestrate domain + ports)
    infrastructure/     ← Adapters (AI provider, storage, external APIs)
    {Vertical}DomainShell.ts  ← Main orchestrator implements IDomainAgentShell
```

#### 3. Process View — Agent Execution Loop
```
Receive Objective
      │
      ▼
  Decompose into Use Cases  (Process Definition)
      │
      ├── UseCase 1 ──► Primary Port ──► Application Service
      │                                        │
      │                              Secondary Port ──► Adapter ──► Real API
      │
      ├── Compliance Guardrail check
      │
      ├── Persist to Domain Memory
      │
      └── Return DomainResult
```

#### 4. Physical View — Deployment
```
VS Code Extension Host
  ├── CentralBrainAgent          ← Unified entry point (RAG + Privacy + Orchestration)
  │     ├── RAGEngine            ──► .alpaquitay/orchestration/knowledge.json (BM25-lite)
  │     ├── PrivacyGuard         ──► PII detection/masking (GDPR / ISO 27018)
  │     └── OrchestratorAgent
  │           ├── MetaheuristicEngine  ← Greedy | GA | Simulated Annealing (auto)
  │           ├── EnglishDomainShell
  │           ├── SoftwareEngineerShell
  │           ├── SoftwareArchitectShell
  │           ├── DeveloperShell
  │           ├── QAShell
  │           ├── DevOpsShell
  │           ├── DevSecOpsShell
  │           ├── SecurityShell
  │           ├── InfrastructureShell
  │           ├── CloudShell
  │           ├── MarketingShell
  │           ├── ProcessShell
  │           ├── AIExpertShell
  │           └── BusinessShell
  │                 └── AIProviderAdapter ──► Anthropic / Ollama / OpenAI
  └── AgentRegistry              ← Lazy factory + semantic scoring for all 14 shells
```

#### +1 Scenarios
- *"Practice past perfect grammar at B1 level"* → English shell `practice-grammar`
- *"Review this code for SOLID violations"* → SoftwareEngineer shell `analyze-solid`
- *"Design a RAG system for our knowledge base"* → AIExpert shell `design-rag`
- *"Build a business case for this initiative"* → Business shell `build-business-case`
- *"Deploy this app with zero-downtime strategy"* → DevOps shell `plan-deployment`
- *"Is my AI system compliant with EU AI Act?"* → AIExpert shell `assess-governance`
- *"What's our LTV:CAC ratio look like?"* → Business shell `financial-model`

---

### Hexagonal Architecture (Ports & Adapters)

```
           ┌───────────────────────────────────────────────┐
           │               APPLICATION CORE                │
           │                                               │
 Caller ──►│ Primary Port     Use Case      Secondary Port │──► Adapter ──► Real API
           │ (input.ts)    (application/)   (output.ts)    │
           │                                               │
           └───────────────────────────────────────────────┘
```

**Primary ports** (input.ts): Typed interfaces the caller invokes. The shell never leaks implementation details outward.

**Secondary ports** (output.ts): Typed interfaces infrastructure must implement. The domain never imports from `infrastructure/` — only from `ports/`.

**Adapters** (infrastructure/): Concrete implementations. Swap the AI provider, the storage backend, or a third-party API without touching a single line of domain or application code.

**Guardrails**: Before any output is committed, `checkGuardrails()` runs domain-specific validation rules (e.g., "a lesson must have at least one exercise", "a financial transaction must balance to zero").

---

### 14 Live Domain Agent Shells

All 14 shells are production TypeScript with 0 compilation errors. Each extends `BaseDomainShell` (Template Method pattern), implements `IDomainAgentShell`, and runs through the unified CentralBrainAgent pipeline.

| # | Domain Shell | Status | Use Cases | Key Guardrails |
|---|---|---|---|---|
| 1 | **English Mastery** | ✅ LIVE | practice-grammar, get-daily-phrases, assess-level, submit-exercise, get-progress | CEFR level validation |
| 2 | **Software Engineer** | ✅ LIVE | review-code, analyze-solid, detect-tech-debt, suggest-patterns, estimate-complexity | Complexity thresholds |
| 3 | **Software Architect** | ✅ LIVE | assess-architecture, create-adr, generate-c4, build-tech-radar, evaluate-quality-attributes | ADR decision traceability |
| 4 | **Developer** | ✅ LIVE | implement-feature, debug-issue, refactor-code, explain-code, generate-tests | Test coverage check |
| 5 | **QA** | ✅ LIVE | create-test-plan, generate-test-cases, triage-bug, evaluate-coverage, define-quality-gate | Coverage gates |
| 6 | **DevOps** | ✅ LIVE | design-pipeline, assess-dora, plan-deployment, generate-iac, create-runbook | DORA metrics |
| 7 | **DevSecOps** | ✅ LIVE | design-secure-pipeline, threat-model, assess-samm, scan-findings-triage, generate-sbom | OWASP SAMM level |
| 8 | **Security** | ✅ LIVE | audit-compliance, plan-pentest, manage-risk-register, respond-incident, assess-csf | Critical risk blocking |
| 9 | **Infrastructure** | ✅ LIVE | plan-capacity, design-network, create-sla, plan-dr, configure-monitoring | SLA availability |
| 10 | **Cloud** | ✅ LIVE | design-architecture, well-architected-review, optimize-cost, plan-migration, generate-iac | Well-Architected pillars |
| 11 | **Marketing** | ✅ LIVE | plan-campaign, segment-audience, analyze-seo, create-content, measure-roi | ROAS threshold |
| 12 | **Process** | ✅ LIVE | map-process, gap-analysis, value-stream-map, iso-compliance, optimize-process | ISO compliance gaps |
| 13 | **AI Expert** | ✅ LIVE | evaluate-llm, design-rag, engineer-prompt, design-ai-system, assess-governance, design-mlops | EU AI Act risk tiers |
| 14 | **Business** | ✅ LIVE | design-business-model, strategic-analysis, define-okrs, financial-model, market-analysis, build-business-case | LTV:CAC · runway · ROI |

---

### Multi-Agent Orchestration Stack

```
┌──────────────────────────────────────────────────────────────────────┐
│                        CentralBrainAgent                             │
│                                                                      │
│  1. PrivacyGuard.sanitize()     ← PII detection (12 pattern types)   │
│  2. RAGEngine.augment()         ← BM25-lite knowledge retrieval      │
│  3. OrchestratorAgent.execute() ← Multi-agent task dispatch          │
│  4. RecursiveRefinement.refine()← Quality improvement loop           │
│  5. RAGEngine.learn()           ← Store high-quality outputs back    │
└──────────────┬───────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────┐
│                       OrchestratorAgent                              │
│                                                                      │
│  MetaheuristicEngine (auto-selects algorithm by problem size):       │
│  ├── n ≤ 3 tasks  → Greedy (immediate, zero overhead)                │
│  ├── n ≤ 10 tasks → Genetic Algorithm (population=20, gen=50)        │
│  └── n > 10 tasks → Simulated Annealing (T₀=1.0, α=0.95, i=200)      │
│                                                                      │
│  → Decomposes objective into tasks                                   │
│  → Assigns each task to the best-scoring Domain Shell                │
│  → Executes in parallel batches respecting dependency graph          │
└──────────────┬───────────────────────────────────────────────────────┘
               │
    ┌──────────┼──────────┬──────────┬──────────┬──────────┐
    ▼          ▼          ▼          ▼          ▼          ▼
EnglishShell  SEShell  ArchShell  AIShell  BizShell  + 9 more shells
```

#### RAG Knowledge Base (BM25-lite)
- 10 seed chunks: ISO/IEC 42010 · TOGAF · DORA Metrics · ISO 27001 · ISO 29119 · ISO 9001 · CEFR · AWS WAF · SOLID · Six Sigma
- Persists to `.alpaquitay/orchestration/knowledge.json`
- `RAGEngine.learn()` adds high-scoring outputs back (score ≥ 80)

#### PrivacyGuard (GDPR / ISO 27001 / ISO 27018)
- 12 PII pattern types: email, phone, SSN, credit card, passport, date of birth, IP, address, IBAN, health ID, NIF, name
- Sanitizes before AI calls; blocks storage of medium/high-risk content
- GDPR Article 5 (data minimization) + Article 17 (right to erasure) mapped

---

### Complete File Structure (46+ files, 0 TypeScript errors)

```
src/domains/
  interfaces/
    DomainAgentShell.ts           ← IDomainAgentShell, DomainId (14 live + 5 planned)
  shared/
    BaseDomainShell.ts            ← Template Method base: ask(), parseJSON(), guardrails
  english/
    domain/model.ts               ← CEFRLevel, Exercise, Lesson, DailyPhrase
    ports/input.ts · output.ts    ← Primary + secondary ports
    application/                  ← 4 use case classes
    infrastructure/               ← AIProviderAdapter, LessonStorageAdapter
    EnglishDomainShell.ts
  software-engineer/
    model.ts · SoftwareEngineerShell.ts
  software-architect/
    model.ts · SoftwareArchitectShell.ts
  developer/
    model.ts · DeveloperShell.ts
  qa/
    model.ts · QAShell.ts
  devops/
    model.ts · DevOpsShell.ts
  devsecops/
    model.ts · DevSecOpsShell.ts
  security/
    model.ts · SecurityShell.ts
  infrastructure/
    model.ts · InfrastructureShell.ts
  cloud/
    model.ts · CloudShell.ts
  marketing/
    model.ts · MarketingShell.ts
  process/
    model.ts · ProcessShell.ts
  ai-expert/
    model.ts · AIExpertShell.ts
  business/
    model.ts · BusinessShell.ts
  orchestration/
    AgentRegistry.ts              ← Catalog of 14 shells, semantic scoring, lazy factory
    OrchestratorAgent.ts          ← Task decomposition, parallel batch execution
    CentralBrainAgent.ts          ← Unified pipeline: RAG + Privacy + Orchestration
    rag/
      KnowledgeBase.ts            ← BM25-lite retrieval, ISO seed chunks, persistence
      RAGEngine.ts                ← augment(), complete(), learn()
    privacy/
      PrivacyGuard.ts             ← 12 PII patterns, GDPR Article mapping, risk scoring
    metaheuristic/
      GeneticOptimizer.ts         ← Population 20, 50 gen, tournament selection, elitism
      RecursiveRefinement.ts      ← Bounded recursive quality improvement, rubric scoring
      MetaheuristicEngine.ts      ← Algorithm auto-selection + refinement orchestration
```

---

### Usage Examples

#### Via CentralBrainAgent (recommended)

```typescript
const brain = new CentralBrainAgent();
await brain.initialize(provider, workspacePath);

// Multi-domain objective — automatically decomposed and distributed
const result = await brain.process(
  'Review the code quality, assess our cloud architecture costs, and define OKRs for Q3'
);
// → Privacy sanitized → RAG augmented → 3 tasks assigned to SE, Cloud, Business shells
// → MetaheuristicEngine optimizes task order → Parallel execution → Refined output
```

#### Direct Domain Shell: AI Expert

```typescript
const result = await brain.delegateTo('ai-expert', 'assess-governance', {
  system:  'Customer credit scoring model',
  context: 'Used in EU for automated loan decisions',
});
// result.data.euAiActRiskTier → 'high'
// Guardrail AI-001: blocks if no humanOversightMechanisms defined
```

#### Direct Domain Shell: Business

```typescript
const result = await brain.delegateTo('business', 'financial-model', {
  business: 'B2B SaaS for HR teams',
  scenario: 'base',
  months:   24,
});
// result.data.unitEconomics.ltvCacRatio → 4.2
// result.data.runway → 18  (months)
// Guardrail BIZ-001: warns if LTV:CAC < 3x
// Guardrail BIZ-002: blocks if runway < 6 months
```

#### English Shell (Reference Implementation)

```typescript
const result = await brain.delegateTo('english', 'assess-level', {
  learnerId:  'alex',
  sampleText: 'Yesterday I have gone to the market and buyed some vegetables.',
});
// result.data.assessment.proposedLevel  → 'A2'
// result.data.assessment.weaknesses     → ['grammar']
// result.data.generatedLessons          → 3 starter lessons
```

#### Agent Catalog

```typescript
// Discover all agents and their capabilities
const catalog = brain.getAgentCatalog();
// → 14 entries with domainId, version, capabilities[], standards[], tags[]

// Semantic search for the right agent
const registry = AgentRegistry.getInstance();
const best = registry.findByUseCase('design a RAG pipeline');
// → 'ai-expert' (highest semantic score)
```

---

## Contributing

```bash
git clone https://github.com/sergioide007/alpaquitay-ai
cd alpaquitay-ai
npm install
npm run compile      # or: npx tsc --watch
# Press F5 in VS Code to launch the Extension Development Host
```

Tests live in `src/test/`. Run with:

```bash
npm test
```

---

## License

MIT — see [LICENSE](./LICENSE).
