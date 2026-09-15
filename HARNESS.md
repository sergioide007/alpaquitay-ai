# Alpaquitay AI — Harness Architecture

> **Version 3.2.1** | Astra-style AI harness for VS Code
> Built on principles from Robert C. Martin (Uncle Bob), Martin Fowler, and Sergio Pérez Ruiz's *Código Sintético*.

## What is Alpaquitay AI?

Alpaquitay AI turns VS Code into a complete **harness-driven development environment**. It's not just a chatbot that writes code — it's a reception, routing, and trust layer that perceives your project, decides the right lane, shows previews before writes, guards with policy, verifies with metrics, and leaves evidence.

## FABLE-5 Framework

| Letter | Principle | Implementation |
|--------|-----------|----------------|
| **F** | **Fingerprint-first** | `WorkspaceFingerprinter` — detects stack from markers, never hardcodes paths |
| **A** | **Ask-before-act** | `Decider` — every risky action asks for confirmation (`si`, `si aplicar`) |
| **B** | **Bounded preview** | `FileDiff` — unified diff capped at 6 files, 120 lines |
| **L** | **Legible-first** | Every response shows chip: lane · stack · phase · gate · DoD · economy |
| **E** | **Evidence-always** | `DecisionLog` — every decision in `.alpaquitay/decisions.jsonl` |

## SDLC with Executable Gates

| Phase | Detected by | Lane | Gate |
|-------|-------------|------|------|
| **Requisitos** | `quiero`, `necesito`, `alcance` | ⚡ Flash | objetivo + alcance + no-alcance + dueño |
| **Diseño** | `arquitectura`, `ADR`, `diagrama` | 🧠 Deep | ADR registrado + sin dependencias circulares |
| **Implementación** | `crea`, `fix`, `endpoint` | 🔨 Build | SOLID + preview + checkpoint + build/test |
| **Pruebas** | `test`, `coverage`, `QA` | 🔨 Build | happy + borde + error, sin bajar coverage |
| **Despliegue** | `deploy`, `pipeline`, `docker` | 🧠 Deep | pipeline verde + aprobación humana + rollback |
| **Mantenimiento** | `monitoreo`, `deuda`, `incidente` | 🧠 Deep | runbook + alerta + dueño + postmortem |

## Chat Commands (free, no LLM)

| Command | Effect |
|---------|--------|
| `onboard` | Legacy onboarding: fingerprint + platform + ADR-001 + DORA |
| `dora` | DORA metrics from git log |
| `deuda` | Agentic debt meter (ceiling 100 blocks Build) |
| `economía` | Session cost: LLM vs local |
| `postmortem <log>` | Classify a pasted failure |
| `diff <ruta>` | Show pending diff |
| `si aplicar` | Review + checkpoint + write |
| `no` | Discard pending diffs |
| `promover` | Idea → spec.md epic |
| `si` | Confirm proposed route |

## Invariant: a validated workspace root (fix EROFS)

*Código Sintético* Cap. 09 — invariants are encoded, not suggested.

The harness never writes through a path it did not first validate. `src/core/WorkspaceRoot.ts` picks the root by priority (`workspaceFolders` → `workspaceFile` dir → `cwd`) and rejects empty, relative, `undefined` and filesystem roots (`/`, `C:\`, `\\share`). Empty `workspaceFolders` used to fall back to `process.cwd()`, which in the extension host is often `/` — turning `spec.md` into a *relative* path resolved against a read-only mount:

```
Error: EROFS: read-only file system, open 'spec.md'
```

Now:

- `SpecManager.specPath` returns `''`; all spec writes funnel through one guarded `_write()`.
- `FilesystemMCP` validates the root before resolving a path and translates `EROFS`/`EACCES`/`ENOENT`/`EISDIR` into actionable messages.
- Every mutation path runs a preflight (chat Build, `regenerate-spec`, `si aplicar`, delete, arch/ADR/infra export, `specs/*` template, checkpoints, Git MCP).
- With no writable root the harness degrades to **chat mode** — it explains the fix instead of failing.
- Path containment uses `path.relative()`, not `startsWith()`, so `/tmp/app2` cannot masquerade as `/tmp/app`.
