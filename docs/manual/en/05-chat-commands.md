---
title: Chat commands
nav: Chat commands
description: Reference for the commands the Alpaquitay AI harness chat understands: onboard, dora, deuda, economía, postmortem, diff, si aplicar, no, promover and si.
---

# Chat commands

Besides natural language, the chat in the **Work** tab understands a set of short commands. Type them **on their own**, as the whole message. Most of them are solved on your machine without calling any model, so they are free and fast. The command names are Spanish words; type them exactly as shown.

```video
title: onboard, dora, deuda and economía
src: media/evidence-chat-en.mp4
poster: media/evidence-chat-en.jpg
duration: 0:35
caption: The harness's local commands on a real project: first analysis, DORA signals, debt and session economy.
```

## Summary

| Command | What it does | Calls a model? |
|---|---|---|
| `onboard` | Analyses the project, detects build and test, writes ADR-001 and computes DORA. | No |
| `dora` | DORA signals from the last 40 commits. | No |
| `deuda` (debt) | Shows the agentic debt meter. | No |
| `economía` or `economia` (economy) | Local operations versus model calls in the session. | No |
| `postmortem <text>` | Classifies a failure you paste (build, test, lint, write…). | No |
| `diff <path>` | Shows a file's pending diff in full. | No |
| `si aplicar` (yes, apply) | Writes every pending diff with policy, review and a checkpoint. | No |
| `no` | Discards every pending diff. | No |
| `promover` (promote) | Turns the latest idea in the inbox into an epic of `spec.md`. | Yes |
| `si` (or `sí`, `dale`, `ok`, `confirmo`) | Confirms the route the harness proposed. | Depends on the route |

> [!NOTE]
> The chat needs an active provider to accept messages, even for these local commands. If there is none, you will see *«No hay proveedor AI disponible»* (no AI provider available).

## onboard

Running `onboard` saves the contract verification; detecting a stack alone does not open the gate. For an unknown stack, confirm the commands with `onboard {"build":"build command","test":"test command"}`.

The best first step in any project, especially a legacy one. Locally, it produces:

- **Project fingerprint:** frameworks, real source folders and entry points. It never assumes `src/`.
- **Platform contract:** the test, build and lint commands for your stack (stored in `.alpaquitay/platform.json`). If it cannot confirm them it says so (*sin verificar — confirma tu comando*: unverified, confirm your command).
- **ADR-001:** a first decision record with the stack, the sources and the harness rule (every write goes through diff, policy and checkpoint), in `.alpaquitay/ADR-001-onboard.md`.
- The repository's **DORA level**.

It also **removes 10 debt points**. Run it once when you start, and again if your stack changes.

## dora

Computes delivery **signals** from `git log` (the last 40 commits), with no external telemetry:

| Signal | How it is computed |
|---|---|
| Frequency | 15 or more commits: "daily or better"; 6 or more: "weekly"; fewer: "occasional". |
| Lead time | "Traceable by #SPEC" when commits are linked to tasks. |
| Failure rate | Share of commits that are *fix*, *hotfix*, *revert*, *rollback* or *bug*. |
| Recovery | Through the harness checkpoints (stashes). |
| Level | **High** when at least 60% of commits are linked and the failure rate is ≤ 15%; **Low** when the rate is above 30%; **Medium** otherwise. |

> [!IMPORTANT]
> These are **repository-derived proxies**, not operational DORA metrics: Git does not know when you deploy or when there is an incident. Alpaquitay labels them that way on purpose. Improve the signal by linking commits with `#SPEC-xxx` and with fewer hotfixes.

## deuda

Shows the score (0 to 100), a bar and the status: *sana* (healthy), *alta — revisa antes de seguir* (high, from 70) or *techo roto — paga deuda antes de Build* (ceiling broken, from 100). The point rules are in [How the harness thinks](../harness/#agentic-debt).

## economía

Counts the operations solved locally (free) against model calls. Each confirmed Build costs 2 to 4 calls. Useful when you pay per use for a cloud provider.

## postmortem

Paste a failure after the word:

```text
postmortem npm ERR! Test failed. See above for more details.
  ● bookings › does not allow booking a taken court
    expect(received).toBe(expected)
```

It classifies it (build, test, lint, diagnostics, write or unknown), suggests the likely cause and the next step, with your project's test command. It runs nothing. The harness also writes an automatic, blameless postmortem when a board task fails.

## diff, si aplicar and no

You can also click **Apply & run gates** or **Discard all** in the **Changes** tab. Both buttons act on every pending diff; **Apply & run gates** runs the same reviews, checkpoint and gates as `si aplicar`.

After the agent generates changes, the chat lists the **pending diffs**. Nothing is written yet.

- `diff src/bookings/calendar.ts` shows that file's full diff.
- `si aplicar` writes **all** pending files. First it checks the debt ceiling and that the folder is writable, saves a Git checkpoint and passes each file through the policy and the automatic review. A blocked file is not written; the rest are.
- `no` discards them all.

## promover

Takes the latest idea in the inbox (`.alpaquitay/ideas.json`) and adds it to `spec.md` as an epic with tasks. Since it writes `spec.md`, it first checks the folder and saves a checkpoint.

## si

When the harness is unsure, or the route is *Deep* (a specialist), it proposes the route and waits. Reply `si` to go ahead with it; anything else is treated as a new message.
