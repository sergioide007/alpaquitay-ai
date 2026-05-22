# Changelog

All notable changes to Alpaquitay are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.0.0] — 2026-05-21

### Added
- **SDD inline editing** — double-click any task or epic to edit it directly in the Spec pane; changes persist to `spec.md` immediately
- **Task controls** — `✎` (rename) and `×` (delete) buttons per task; `+ Add task` button per epic
- **Epic controls** — `✎` (rename) and `×` (delete) buttons per epic; `+ Add Epic` button at the bottom of the Spec pane
- **SoftwareArchitectShell wired** — Arch tab AI chat now routes through `SoftwareArchitectShell.run('interactive-diagram', ...)` instead of raw `provider.chat()`; respects ISO/IEC 42010 guardrail SA-001 (high-risk warning)
- **Assess button** — runs `SoftwareArchitectShell.run('assess-architecture', ...)` and returns a quality report mapped to ISO/IEC 25010 criteria
- **ADR button** — embedded context + decision form in the panel; runs `SoftwareArchitectShell.run('create-adr', ...)` and writes `.alpaquitay/adrs/ADR-XXXX.md` (auto-numbered)
- **C4 level selector** — Arch Canvas now supports Context / Container / Component levels (C4 model)
- 10 new `WebviewMessage` types for spec inline editing and ADR/assess actions

### Changed
- `configureProvider` command title: "Configurar proveedor AI" → "Configure AI Provider"
- README version badge: 2.0.0 → 3.0.0
- Performance table: "v2.1" → "v3.0"
- ADR form is embedded in the panel (no popup)

### Fixed
- Spec pane was read-only; all editing operations now write back to `spec.md` without leaving the panel

### Tests
- 207 tests passing (up from 114 in v2.0.0)
- New coverage: inline editing handlers, ADR creation pipeline, SoftwareArchitectShell integration

---

## [2.0.0] — 2026-05-16

### Added
- **Spec-Driven Development (SDD)** — `spec.md` as the single source of truth; Kanban board derives state from checkboxes
- **Kanban board** — four columns (Backlog, Todo, In Progress, Done); drag a card to trigger AI implementation
- **DeepAgentSkill** — two-phase pipeline: file-plan AI call → per-file code generation → MCP write
- **Hierarchical Memory** — auto-extracts class names, exported functions, and completed features into `.alpaquitay/memory.json`
- **14 Domain Agent Shells** — English, Software Engineer, Architect, Developer, QA, DevOps, DevSecOps, Security, Infrastructure, Cloud, Marketing, Process, AI Expert, Business
- **CentralBrainAgent** — unified pipeline: PrivacyGuard → RAGEngine (BM25-lite) → OrchestratorAgent → MetaheuristicEngine → RecursiveRefinement
- **MetaheuristicEngine** — auto-selects Greedy / Genetic Algorithm / Simulated Annealing based on task count
- **PrivacyGuard** — 12 PII pattern types, GDPR Article 5 & 17 mapping, masking before AI calls
- **RAGEngine** — BM25-lite retrieval with ISO seed chunks; learns from high-score outputs
- **New skills**: `project-builder`, `generate-from-spec`, `validate-against-spec`, `new-specification`, `daily-standup`
- **Model catalog** — dynamic model list for Anthropic (Opus 4.7, Sonnet 4.6, Haiku 4.5), OpenAI, Ollama, LM Studio
- **Small model mode** — auto-detected for models ≤ 4B params; injects stricter no-comment rules and lower temperature
- **Clean Architecture scaffolding** — Java (Maven/Gradle), Spring+React monorepo, React (Clean Arch), 16 total stack patterns
- `alpaquitay-ai.specFile` setting — configurable spec filename
- `alpaquitay-ai.systemPrompt` and `alpaquitay-ai.orgContext` settings for global AI customization

### Changed
- Complete rewrite of the WebView panel into a 5-tab SPA (Spec, Board, Chat, Git, Settings)
- AIProviderManager now resolves provider via ModelCatalog; no hardcoded values in the pipeline
- Git tab links commits referencing `#SPEC-XXX` directly to tasks

### Security
- spec.md writes protected during task execution (prevents AI from overwriting its source of truth)
- PrivacyGuard sanitizes all prompts before cloud AI calls

---

## [1.0.0] — 2026-05-11

### Added
- Multi-provider AI support: Anthropic Claude, OpenAI GPT, Ollama, LM Studio
- Auto-detection of local Ollama and LM Studio servers
- AI chat panel with conversation history
- Skills system: `create-file`, `refactor`, `generate-tests`
- MCP (Model Context Protocol) servers: Filesystem and Git
- Secure API key storage via VS Code SecretStorage (OS keychain)
- GDPR/CCPA compliant privacy controls
- Telemetry opt-in system (disabled by default)
- MIT License

### Security
- API keys never stored in plaintext settings
- All AI requests made directly from client to provider (no proxy)
- Local model support for fully air-gapped/private workflows
