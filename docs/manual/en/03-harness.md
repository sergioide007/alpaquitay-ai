---
title: How the harness thinks
nav: How the harness thinks
description: The Flash, Build and Deep lanes, the six SDLC phases and their gates, the FABLE-5 rules, agentic debt and the evidence Alpaquitay keeps in .alpaquitay/.
---

# How the harness thinks

A plain AI assistant takes your text and answers. Alpaquitay puts a **harness** in front: a deterministic layer (no model involved) that perceives the project, decides what kind of work this is, limits what can happen and keeps a record. Knowing how it works helps you ask better and understand why it sometimes asks before acting.

![The harness pipeline: perceive, decide, lanes and evidence](diagrams/01-harness-pipeline.svg "Every request is perceived, sent to exactly one lane, previewed before any write, guarded, verified and logged.")

## The five stages

1. **Perceive.** It detects the stack from marker files (`package.json`, `pom.xml`, `go.mod`, `pyproject.toml`…) and the real source folders. It never assumes the code lives in `src/`.
2. **Decide.** It classifies your request into a lane and a lifecycle phase, with a visible confidence and reasons.
3. **Preview.** If something must be written, it prepares a bounded *diff*. Nothing touches the disk yet.
4. **Guard and verify.** Write policy, automatic review, a Git checkpoint and, after applying, the real build and test commands.
5. **Keep evidence.** Decisions, debt and economy are stored in `.alpaquitay/`.

## The three lanes

| Lane | When | What it does | Cost |
|---|---|---|---|
| ⚡ **Flash** | Short questions, explanations, loose ideas. | Answers in the chat or files the idea in the inbox. Writes no files. | One call, or none. |
| 🔨 **Build** | Create, implement, fix or refactor; talk about the spec or the board. | From the **board**: plans, generates and leaves **pending diffs** for you to approve. From the **chat**: once you confirm with `si`, it turns your request into a new `spec.md` to work through on the board (see the warning below). | 2 to 4 calls per confirmed change. |
| 🧠 **Deep** | The message mentions deployment (*deploy*, *despliegue*), pipelines, Docker, Terraform, AWS, Azure, GCP, IaC, DORA, pentests, threats (*amenazas*), STRIDE, SBOM, OWASP SAMM, FinOps, zero trust, runbooks or MLOps. | Sends the request to **one registered specialist** (security, DevOps, architecture, QA…). | One call to the specialist. |

The harness decides with readable rules, not with another model. The keyword lists are bilingual, tuned first for Spanish; these English requests route as shown:

| You type… | Lane | Why |
|---|---|---|
| "what is an ADR?" | Flash · chat | short question |
| "I have an idea for the login" | Flash · ideate | loose idea → idea inbox |
| "add a payments epic to the spec" | Build · spec | mentions the spec, an epic or the board |
| "implement the bookings endpoint" | Build · code | code vocabulary |
| "prepare the deployment pipeline on AWS" | Deep · specialist | operations or infrastructure |

> [!WARNING]
> Confirming with `si` a code request typed in the chat (*"implement the bookings endpoint"*) **generates a new `spec.md` from that request and replaces the current one**. A Git checkpoint is saved first, so you can get it back, but if you already have a spec you want to keep, add the task to the board, move it from *Backlog* to *Todo*, then start it in *In Progress*.

When confidence is low or the route is Deep, the harness **proposes the route and waits**: reply `si` (or `sí`, `dale`, `ok`, `confirmo`) to go ahead. Every answer shows a readable line with the lane, stack, phase, gate and session economy.

## The six SDLC phases and their gates

The harness also places each request in a lifecycle phase. A phase only moves on when its **exit gate** passes.

![Six SDLC phases with keywords, lane and gate](diagrams/04-sdlc-gates.svg "The six phases, the words that trigger them, their lane and the gate to pass.")

| Phase | Triggered by words such as… | Exit gate |
|---|---|---|
| 01 Requirements | requisito, idea, alcance, historia, objetivo, épica | objective + scope + out of scope + owner |
| 02 Design | diseño, arquitectura, ADR, diagrama, esquema | ADR recorded + no circular dependencies |
| 03 Implementation | crea, genera, implementa, fix, bug, refactor, endpoint | SOLID + preview + checkpoint + build and test |
| 04 Testing | test, prueba, coverage, QA, e2e, unit | happy path + edge + error for every public method |
| 05 Deployment | deploy, pipeline, docker, release, rollback, terraform, aws | green pipeline + human approval + rollback ready |
| 06 Maintenance | logs, deuda, upgrade, incidente, postmortem, oncall | runbook + alert + service owner |

## FABLE-5: the five design rules

| Letter | Principle | How you notice it |
|---|---|---|
| **F** | Fingerprint-first | It detects your real stack before proposing anything. |
| **A** | Ask-before-act | Every write and every risky route asks for confirmation. |
| **B** | Bounded preview | A change plans at most **6 files**; more than that must be split into batches. |
| **L** | Legible-first | Every answer states lane, stack, phase, gate and economy. |
| **E** | Evidence-always | Every decision lands in `.alpaquitay/decisions.jsonl`. |

## What guards a write

Review agent activity and diffs in **Changes**. Its **Apply & run gates** and **Discard all** buttons act on every pending diff; applying starts the same guarded flow as `si aplicar`, and discarding is equivalent to `no`.

When you reply `si aplicar` (or click **Apply & run gates**), for **each pending file**:

1. **Write policy.** Files that *are* secrets are always denied: `.env`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `secrets/` folders, credential or token files. Writing `spec.md` needs confirmation and a backup.
2. **Automatic review** (no model). It **blocks** when the file is outside the detected source folders or the content looks like a literal secret (API keys, private keys, AWS keys, `sk-…`, `ghp_…`, JWTs). It **warns** when the file passes 400 lines, when `console.log`, `print(`, `TODO` or `FIXME` remain, or when the change changes nothing.
3. **Git checkpoint.** Before writing it saves a stash named `alpaquitay/apply-diffs-<date>` and re-applies it, so your work stays in the tree and you also get a way back. Without Git it carries on without a checkpoint and says so.
4. **Write and verify.** It writes the approved files and runs the real build and test commands detected by `onboard`.

To go back after a `si aplicar`, find the stash with `git stash list` (Alpaquitay's start with `alpaquitay/`) and restore it with `git stash apply stash@{N}`.

## The Definition of Done (DoD)

A card moves to **Done** only when it passes the DoD gate:

- no diffs are left unapplied (`si aplicar` or `no` first);
- for code projects, the **platform contract** is verified by an explicit `onboard` run and saved for the current stack;
- for code projects, build and tests **really ran** and came back green. Knowing which command to run does not count as having run it.

Projects with no source code (for example, only PDFs, Markdown and HTML) skip the contract and quality evidence checks; pending diffs still block Done. The gate reads the saved contract without creating one and runs the exact build and test commands stored in `.alpaquitay/platform.json`. If the stack is not detected, confirm both commands with `onboard {"build":"...","test":"..."}`.

If something fails, the card stays *In Progress* and the chat shows what blocks it, with an automatic, blameless postmortem.

## Agentic debt

Every risky decision adds debt and every gate passed pays some back. The meter runs from 0 to 100; **at 100 the Build lane is blocked** until you pay it down.

| Event | Points |
|---|---|
| Pending diff left unresolved | +2 |
| Postmortem (something failed) | +10 |
| DoD blocked | +15 |
| Deployment without a rollback plan | +25 |
| Any other recorded decision | +1 |
| Successful `si aplicar` | −5 |
| Verified *Done* | −8 |
| `onboard` | −10 |

Above 70 the harness warns you (*alta, revisa antes de seguir*: high, review before going on). Check the meter with `deuda` in the chat or in the [Evidence](../evidence/) tab.

## Session economy

The harness counts how many operations it solved **locally, for free** (`dora`, `deuda`, `postmortem`, `diff`, reviews, `economía`) against how many **model calls** it made. Type `economía` to see it. Its advice: short questions in Flash, `onboard` once, diffs in batches.

## Where to look if you want to audit

Everything is text in your repository. `decisions.jsonl` has one JSON line per decision, with its route, lane, confidence and reasons; `debt.json` keeps the last 50 debt events. You can read them, commit them or process them with your own tools.
