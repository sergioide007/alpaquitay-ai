# Changelog

All notable changes to Alpaquitay are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [3.2.1] — 2026-09-15

### Fixed — `EROFS: read-only file system, open 'spec.md'`

Reported flow: **Describe the project → Generar** failed with `Error: EROFS: read-only file system, open 'spec.md'`.

**Root cause.** When `vscode.workspace.workspaceFolders` was empty (single-file window, virtual workspace, remote/Codespaces without folder), `extension.activate()` fell back to `process.cwd()`. In the extension host that value is frequently `/` (or another read-only mount), so `path.join(root, 'spec.md')` produced the **relative** path `'spec.md'`, which Node resolved against that read-only cwd.

**Fix.** The workspace root is now a validated harness invariant (`src/core/WorkspaceRoot.ts`):

- `pickWorkspaceRoot()` resolves the root by priority — `workspaceFolders` → `workspaceFile` (dir) → `cwd` — and **rejects** empty, relative, `undefined` and filesystem roots (`/`, `C:\`, `\\share`).
- `SpecManager.specPath` returns `''` instead of a relative `'spec.md'`; every spec write funnels through one guarded `_write()`.
- `FilesystemMCP` validates the root before resolving any path, and translates `EROFS`/`EACCES`/`ENOENT`/`EISDIR` into actionable messages.
- All mutation paths now run a preflight (`_preflightWrite()`): chat Build, `regenerate-spec`, `si aplicar`, delete-file, arch/ADR/infra export, `specs/*` template command, Checkpoints and Git MCP.
- When no writable root exists, the extension degrades to **chat mode** (never writes), warns once with an "Open Folder" action, and explains the fix in the output channel.

### Fixed — other latent filesystem defects found in the same audit

- `LessonStorageAdapter` and `BaseDomainShell.saveMemory()`: `path.join('', '.alpaquitay', …)` silently produced **relative** paths — the same latent `EROFS`/cwd leak. They now keep data in memory when the root is unusable.
- `KnowledgeBase`, `CodeIndexer`, `CursorIntegration`, `WindsurfIntegration`: guarded writes (best-effort persistence; in-memory index/search still works).
- `FilesystemMCP.safePath`: path containment now uses `path.relative()` instead of `startsWith()`, closing a sibling-prefix traversal hole (`/tmp/app2` vs `/tmp/app`).

### Tests

- `WorkspaceRoot.test.ts` (18 tests) — root selection/validation, actionable error translation, labels.
- `SpecManagerRoot.test.ts` (6 tests) — fail-safe persistence with/without a writable root, sibling-prefix traversal block.
- Suite total: **357 tests / 38 suites**, all green.

---

## [3.2.0] — 2026-09-14

### Added — Astra-Style Harness Engineering (FABLE-5)

A complete reception-and-trust layer built on Código Sintético principles. The extension is now a full AI harness, not just a prompt wrapper.

#### Core Harness Architecture (FABLE-5)

- **Fingerprint-first**: `WorkspaceFingerprinter` — never assumes `src/`, detects stack from markers (`package.json`, `pom.xml`, `manage.py`, `go.mod`, `Cargo.toml`, `.csproj`, etc.) with cache in `.alpaquitay/fingerprint.json`
- **Ask-before-act**: `Decider` with 3 lanes — ⚡ Flash (chat/ideate, no LLM cost), 🔨 Build (preview + checkpoint + SDD), 🧠 Deep (specialist orchestration)
- **Bounded preview**: `FileDiff` with unified diff (LCS-based) before any write, capped at 6 files, 120 lines
- **Legible-first**: every response shows chip: lane · stack · sourceDirs · SDLC phase · gate · DoD · economy
- **Evidence-always**: `DecisionLog` writes every decision to `.alpaquitay/decisions.jsonl`

#### SDLC with Executable Gates

- `SdlcRouter`: 6 phases (requisitos → diseño → implementación → pruebas → despliegue → mantenimiento) each with exit gate
- `DefinitionOfDone`: done is blocked if diffs pending or platform contract unverified
- `AgentReview`: pre-apply review (security, scope, SRP, hygiene) — local, no LLM
- `Postmortem`: blameless failure classification (build/test/lint/write/diagnostics) with suggested fix

#### Platform Engineering

- `PlatformContract`: verified golden paths per stack (npm/pip/maven/gradle/go/cargo/dotnet) — never invents commands
- `CheckpointManager`: git stash before every write (reversible, non-blocking)
- `PolicyGuard`: denies secrets (`.env`, `*.pem`, `id_rsa`), confirms spec.md writes
- `IdeaInbox`: capture unstructured ideas before spec.md, promote with `promover`
- `Onboard`: one-command legacy onboarding (fingerprint + platform + ADR-001 + DORA)

#### Observability (DORA + Economy)

- `DebtTracker`: measures agentic debt (dod-blocked +15, postmortem +10, deploy w/o rollback +25; onboard/done/apply pay it down). Ceiling at 100 blocks Build
- `Economy`: tracks LLM calls vs free local operations, shows 💰 chip per response
- `DORA`: metrics from git log alone (frequency, lead time via #SPEC, change failure rate)

#### New Chat Commands (all free, no LLM)

| Command | Effect |
|---------|--------|
| `onboard` | Legacy onboarding report |
| `dora` | DORA metrics from git |
| `deuda` | Agentic debt meter |
| `economía` | Session cost tracker |
| `postmortem <log>` | Classify a pasted failure |
| `diff <ruta>` | Show pending diff |
| `si aplicar` | Review + checkpoint + write |
| `no` | Discard pending diffs |
| `promover` | Idea → spec.md epic |

#### Diff-First Writes

- Build no longer writes directly — generates diffs, shows preview, waits for `si aplicar`
- Each file reviewed before write (secrets, scope, size, noise)
- PolicyGuard blocks protected paths before even showing diff

#### CI/CD Pipeline

- GitHub Actions: test → package → publish (VS Code Marketplace + Open VSX)
- Secrets needed: `VSCE_PAT`, `OVSX_PAT`

---

## [3.1.0] — 2026-05-26

### Added — Security & Cloud Excellence Domain Agents

#### New Domain Agent Shells (3)

- **Quantum Readiness Agent** (`quantum-readiness`) — NIST FIPS 203/204/205 · NSA CNSA 2.0
  - `crypto-inventory` — maps all classical crypto (RSA/ECC/DH) to PQC replacements
  - `quantum-threat-timeline` — HNDL risk window + industry mandate deadlines
  - `pqc-migration-plan` — phased hybrid classical→PQC migration (crypto agility layer first)
  - `cbom-generate` — Cryptography Bill of Materials (CBOM), analogous to SBOM
  - `assess-crypto-agility` — evaluates algorithm negotiation, key length flexibility, hybrid mode
  - Guardrails: blocks RSA < 4096 in certificates; blocks quantum risk score ≥ 80

- **Well-Architected Agent** (`well-architected`) — AWS WAF 2023 · Azure WAF 2024 · GCP CAF · FinOps Foundation · DORA
  - `aws-waf-full-review` — all 6 pillars (OE, Security, Reliability, Performance, Cost, Sustainability)
  - `azure-waf-review` — all 5 Azure pillars with Azure-native service guidance
  - `gcp-caf-review` — GCP CAF with BeyondProd, SRE, and Andromeda SDN patterns
  - `multi-cloud-comparison` — vendor-neutral scoring across AWS/Azure/GCP
  - `operational-excellence-scorecard` — DORA elite tier + SRE Golden Signals + observability maturity (L1-L5)
  - `sustainability-assessment` — SCI score (Green Software Foundation) + SDG 7/12/13 alignment
  - `finops-review` — FinOps Inform/Optimize/Operate lifecycle + unit economics
  - Guardrails: blocks security pillar < 60; warns reliability < 70; warns wasted spend > 30%

- **Zero Trust Architecture Agent** (`zero-trust`) — NIST SP 800-207 · CISA ZTMM v2.0 · BeyondCorp
  - `assess-ztmm` — CISA ZTMM v2.0 across 5 pillars (Identity, Devices, Networks, Apps, Data) × 4 stages
  - `design-identity-fabric` — MFA + conditional access + JIT + PAM (BeyondCorp model)
  - `microsegmentation-plan` — eliminates implicit east-west trust (eBPF/Cilium/Istio/VPC)
  - `continuous-verification-policy` — per-request trust signal scoring + adaptive access rules
  - `privileged-access-design` — tiered PAM (Tier 0-3), ZSP, session recording, break-glass
  - Guardrails: blocks implicit trust zones; blocks missing MFA on privileged access; warns lateral movement risk

#### Enhanced Domain Agent Shells (3)

- **SecurityShell v2.0** — added:
  - `assess-quantum-risk` — HNDL exposure + Shor/Grover algorithm mapping + NSA CNSA 2.0 timeline
  - `supply-chain-security` — SLSA levels + OpenSSF Scorecard + NIST SP 800-161 + provenance attestation

- **DevSecOpsShell v2.0** — added:
  - `assess-slsa` — SLSA 0-4 gap analysis across Source/Build/Provenance/Common tracks
  - `generate-sigstore-policy` — keyless cosign signing + Policy Controller + Rekor transparency log
  - `assess-cnapp` — CSPM + CWPP + CIEM + KSPM convergence (Defender for Cloud / Security Hub / SCC)

- **CloudShell v2.0** — added:
  - `chaos-engineering-plan` — AWS FIS / Azure Chaos Studio / LitmusChaos experiments + Game Day design
  - `sustainability-review` — AWS SUS 1-6 + SCI score + CO₂ savings per action

---

## [3.0.1] — 2026-05-26

### Fixed
- Landing page: replaced outdated "Marketplace coming soon" notice with direct install buttons for VS Code Marketplace and Open VSX
- Landing page: updated displayed version from v2.0 to v3.0
- `package.json` homepage aligned to `https://alpaquitay-ai.specsolid.com` (matches CNAME/DNS)

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
