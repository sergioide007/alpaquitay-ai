# Changelog

All notable changes to Alpaquitay are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

---

## [3.6.1] — 2026-10-24

### Security — local engine hardening

- **Node.js security floor raised to the November 2026 security releases** (22.23.5 / 24.22.3 / 26.13.1, highest severity HIGH), verified against nodejs.org on 2026-11-14.
- **The CDN is now untrusted by design.** Model manifests are schema 2, **signed with Ed25519**, and list a **SHA-256 per 8 MiB block** of every file. The extension host verifies the signature (keys in `src/local/trustedKeys.ts` + optional user keys) and hands the Webview only the verified manifest. The Webview refuses any block that does not match, any file that is not listed, and (anti-rollback) any older signed manifest.
- **ONNX Runtime pinned by hash.** `npm run build:engine` records the SHA-256 of the exact runtime files in the bundle; the Webview verifies them and gives ONNX Runtime `blob:` URLs. The Webview CSP no longer allows any remote script origin. (transformers.js would swallow a failed preload and import the runtime unverified from the CDN; we do not use that path.)
- **No decompressor before the signature check.** The manifest is fetched with `node:https`, `Accept-Encoding: identity`, and any `Content-Encoding` is rejected at the header stage. Context: Node's `fetch()` advertises `br` and decodes it transparently, and the [Node.js 2026-10-21 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) fixed an out-of-bounds write in the Brotli decoder (CVE-2026-111497).
- CDN hosts must be DNS names: IP literals in any spelling are rejected (the same release fixed three TLS bugs that only affect IP-literal hosts).
- `localEngine.enabled`, `cdnBaseUrl`, `modelId` and `extraTrustedKeys` are `application`-scoped: a workspace cannot redirect downloads or inject keys.
- Guards: model/file/manifest size caps, prompt length cap, storage-quota preflight, capability checks (WebGPU, RAM) **before** the download, one inference at a time with per-request cancel, `O_EXCL` file creation, Gemma 4 reasoning blocks stripped.
- **Node.js security floor** (`scripts/node-security-floor.json`, `npm run check:node`) enforced in CI, publish, release and `verify-marketplace.js`. CI and publish ran on **Node 20 (end-of-life, no patch)**; they now use Node 22. CI also runs the unit tests and the engine/worker type-checks.

### Added

- `npm run cdn:keygen`, `cdn:sign`, `cdn:verify` (post-deployment check of the live CDN: signature, headers, MIME, `Range`, every block hash, runtime pins). An end-to-end test runs the stager, signer, Worker handler and consumers against a real local HTTP server.
- `docs/LOCAL-ENGINE.md`: architecture, threat model, failure register, objections and honest answers, setup with a real model (Gemma 4 E2B text-only), operations, and what is not verified yet.
- Settings `localEngine.dtype` and `localEngine.extraTrustedKeys`; default model `gemma-4-e2b-it`.

### Changed

- **Breaking for anyone who staged with 3.6.0:** manifests must be schema 2 and signed. Re-run `cdn:stage` and `cdn:sign`. Unsigned or old manifests are refused.
- The model precision is no longer hard-coded: it comes from the manifest and the device (`q4f16` only with `shader-f16`). The system role is native or folded per model.

### Fixed

- README listed a Twitter/X account, a Discord server and `hello@specsolid.com`, none of which exist; it now lists the real contact channels. The README also said "No Alpaquitay servers exist", which the optional model CDN would make inaccurate: it now says no server ever receives code or prompts.
- Documentation claimed the first download was "hundreds of MB" and that large files "never sit in memory": the real Gemma 4 E2B text-only download is ≈3.1 GB and transformers.js reads each file fully into memory.
- A healthy download served with `Content-Encoding` was rejected because `Content-Length` holds the encoded size.
- `ReadableStream` stall in the block verifier when upstream pieces are smaller than a block.

## [3.6.0] — 2026-10-08

### Added — Local Gemma engine (WebGPU / Wasm, $0 backend)

- New command **Generate Specification (Local Gemma)** (`alpaquitay-ai.generateSpecLocal`): writes `specs/<name>.md` in `spec.md` format using a Gemma ONNX model that runs entirely on your machine, with a cancellable progress notification. The first run shows the download size (from the CDN `manifest.json`) and asks for confirmation.
- New opt-in provider **`local-wasm`** (`alpaquitay-ai.localEngine.enabled`). `auto` tries Ollama and LM Studio first, then this one. It is classified as local by the privacy boundary.
- **`GemmaWasmEngine`** (`engine/`, bundled to `dist/engine-webview.js`): singleton on transformers.js + onnxruntime-web, WebGPU with automatic Wasm fallback. Runs in a Webview because the Node extension host has no WebGPU; its CSP only allows connections to the CDN origin.
- **IndexedDB model cache**: 8 MB chunks served back as a lazy stream, incomplete downloads never served, per-model invalidation through the manifest `revision`, works offline once cached. New command **Clear Local Model Cache**.
- **CDN Worker** (`worker/`, Cloudflare Worker + R2) for `alpaquitay.specsolid.com/models/*`: CORS allow-list (project domains and VS Code Webviews), COEP/CORP/COOP, strict MIME for `.wasm` / `.onnx` / `.json` (415 otherwise), `Range` (206 with `Content-Range`), `ETag` (304), immutable caching. The policy lives in `src/local/cdnPolicy.ts`, shared by Worker, Webview and tests.
- `npm run cdn:stage` prepares the files to upload (ONNX Runtime of the exact bundled version + model + manifest). Deployment guide in `worker/README.md`.
- New settings: `localEngine.enabled`, `localEngine.cdnBaseUrl` (application scope, https only), `localEngine.modelId`, `localEngine.device`, `localEngine.maxNewTokens`.
- Documentation: README section, architecture diagram 11, PRIVACY.md 2.1.1 (the CDN sees standard request metadata when weights are downloaded; never prompts).

### Changed

- `vscode:prepublish` now also builds the Webview bundle (`npm run build:engine`). New dev dependencies: `esbuild`, `@huggingface/transformers` (bundled, not a runtime dependency), `@cloudflare/workers-types`, `fake-indexeddb`. The extension still has zero runtime dependencies.
- `.npmrc` sets `ignore-scripts=true`: `onnxruntime-node` (a transitive dependency of transformers.js, unused here) downloads native binaries in its install script and would fail or slow down `npm ci`.
- `scripts/verify-marketplace.js` checks the engine bundle, the new commands and settings, and the VSIX contents.

### Fixed

- The Hub's privacy indicator now reports `local-wasm` as local, and the model picker lists its model.

## [3.5.0] — 2026-09-20

### Added — Docs tab: an agent for Word, Markdown, EPUB, PDF and text

- New main tab **Docs** (next to Work). Plain-language requests in Spanish or English: proofread, improve style, shorten, expand, translate, or any free-form instruction; plus analysis (summarize, outline, cross-chapter consistency check, developmental feedback, questions about the book).
- Formats: `.docx` (edits written as **Word tracked changes**), `.md`/`.txt` (lossless outside edited blocks), `.epub` (chapters via spine; `<em>`/`<strong>` preserved), `.pdf` (read-only, best effort; edits exported as Markdown).
- Convert any document to Markdown, Word or EPUB from the tab.
- Same harness contract as code: the agent proposes, a word-level diff is reviewed, risky rewrites are not pre-selected, output goes to a new file by default (overwrite makes a backup in `.alpaquitay/backups/`), PolicyGuard runs on the output path, and the written file is re-read to verify it. Whole-book runs above 20 model calls ask for confirmation (limit 60). Links, footnotes, fields, images, tables and code are protected blocks.
- Zero runtime dependencies: own ZIP reader/writer (`ZipLite`), DOCX/EPUB adapters and a PDF text reader. Validated against LibreOffice and python-docx.
- Documentation: 10 architecture and design diagrams in `docs/diagrams/` (PNG for the Marketplace README, SVG sources, Python generators).

### Fixed

- **Checkpoint removed the developer's uncommitted work.** `git stash push` takes changes out of the working tree; it is now followed by `git stash apply`, so a checkpoint is a snapshot, not a side effect. A clean tree no longer reports a checkpoint (or reuses an older stash).
- **PolicyGuard denied any path containing `token`** (`tokenService.ts`, `TokenProvider.java`, `tokenizer/`). It now denies token *files* (`token.json`, `.token`, `access_token`…), not source that mentions tokens.
- **AgentReview blocked ordinary auth code** because the words `token`/`password`/`secret` appeared. It now flags literal secrets only (assigned string literals, private keys, AWS/OpenAI/GitHub keys, JWTs).
- **Decider routed unrelated text to the ops specialist**: `aws` matched “laws”, `iac` matched “cardiac”. Keywords now use word boundaries.
- Mojibake in the correction header (`ðŸ”„` → 🔄).
- README: version and test badges, duplicated sections, the outdated “deferred quality” pipeline (Done now requires evidence), 14 → 17 domain shells, and the PII detector count (9).
- CHANGELOG: 3.4.0 entry was out of order.
- `.vscodeignore` excludes `docs/**` from the VSIX.


## [3.4.0] — 2026-09-19

### Added — System Architecture inference (Arch Tab)

The Arch canvas no longer draws only the spec's **epics**; it now infers the architecture of the **system itself** — what the workspace already has and what the spec will build.

- **Inference engine** (`src/core/context/SystemArchitecture.ts`, pure + unit-tested):
  - **Current workspace**: dependency manifests — `package.json` (root + monorepo subpackages), `requirements.txt`, `pyproject.toml`, `pom.xml`, `build.gradle(.kts)`, `go.mod`, `composer.json`, `Gemfile`, `*.csproj`, `serverless.yml` — mapped to system components: client frameworks (React/Vue/Angular/Next…), APIs (Express/NestJS/Spring/Django/FastAPI/Flask/Gin/Laravel/Rails/ASP.NET…), databases and ORMs (PostgreSQL/MySQL/MongoDB/SQLite/Prisma…), caches (Redis/Memcached), queues (Kafka/RabbitMQ/Celery/Bull/SQS…), auth (JWT/Passport/OAuth), object storage (S3), search/realtime/notifications services, serverless and IaC folders.
  - **Docker Compose**: `docker-compose.yml` / `compose.yaml` services (registry- and tag-aware images) become real infrastructure nodes (PostgreSQL, Redis, Kafka, RabbitMQ, reverse proxy, Keycloak, MinIO, monitoring…).
  - **Spec content**: technology keywords across the **full `spec.md` text** (epic titles, tasks and body) — Spanish and English, accent-normalized.
  - Concrete detections win over generic ones; no duplicated components. Epic titles still appear as functional **modules**, but only when the system doesn't already cover that component type.
- **"↻ Re-infer" button** in the Arch toolbar (+ `arch-reinfer` message): regenerates the diagram on demand — a stale saved `.alpaquitay/arch.json` no longer shadows the inference — and shows a toast summary (`System: React SPA · Node/Express API · PostgreSQL · …`).
- **Auto-wiring**: client → main API/service (HTTP or via reverse proxy), main → auth/db/cache/queue, epic modules → main entry point.
- Tests: `SystemArchitecture.test.ts` — 17 new unit tests. Suite total: **389 tests / 42 suites**, all green.

---

## [3.3.0] — 2026-09-15

### Added — Privacy boundary for cloud providers

- New `PrivacyBoundaryProvider` (`src/providers/PrivacyBoundaryProvider.ts`): a redaction facade wrapped around every **cloud** provider (Anthropic, OpenAI, and non-loopback Ollama/LM Studio endpoints). PII (emails, phones, cards, SSN, IBAN, tokens) is redacted before the prompt leaves the machine; the response is detokenized back transparently.
- Local providers (loopback Ollama / LM Studio) run **undecorated** — zero overhead, zero egress.
- `AIProviderManager.getLastPrivacyDisclosure()` exposes value-free metadata (counts only, never content) for the Hub's Privacy boundary card.
- Phone PII regex rewritten with a lookbehind guard — no more false positives on plain numbers/dates.

### Added — Specialist routing (Flash / Build / Deep lanes)

- New `SpecialistRouter` (`src/core/reception/SpecialistRouter.ts`): the reception layer routes each request to exactly one lane — **Flash** (local, zero-cost), **Build** (diff-first implementation) or **Deep** (registered specialist: security · QA · architecture · DevOps) — with one auditable receipt per route.

### Added — Executable quality gates (DoD v2)

- New `QualityEvidence` (`src/core/sdlc/QualityEvidence.ts`): `Done` on the Kanban board now requires **proof** — a real `build` command and a real `test` command that both ran with green exit codes. The platform contract checklist alone is no longer sufficient for mutation flows.

### Added — Harness tab (delivery control plane)

- New Hub section with live evidence: repository DORA signal (labeled as repo-derived proxies), agentic debt ceiling with event log, diff-first review queue (review → apply → verify), session economy (local ops vs LLM calls), privacy boundary status, and specialist routing quick-actions.
- Kanban cards now surface a **"Review required"** state while a task's diffs await approval.

### Tests

- Suite total: **372 tests / 41 suites**, all green.

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
