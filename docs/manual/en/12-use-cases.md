---
title: Step-by-step use cases
nav: Use cases
description: Concrete recipes for Alpaquitay AI: understand a legacy project, start a new one from an idea, work without code leaving your machine, write a book, record an architecture decision, review security and follow a team's delivery.
---

# Step-by-step use cases

Each recipe says who it is for, what you need and the steps, with links to the chapter that explains each piece.

## 1. Understand an undocumented legacy project

**For:** whoever inherits a repository and needs to find their way before touching anything.
**You need:** the repository with its Git history, and any provider.

1. Open the folder and the Hub (<kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>A</kbd>).
2. Type `onboard`. You get the stack, the real source folders, the test and build commands and an ADR-001 in `.alpaquitay/`. [Chat commands](../chat-commands/#onboard)
3. Type `dora` to see how delivery has gone so far: frequency, share of fixes and traceability. [Chat commands](../chat-commands/#dora)
4. Open **Architecture** and click **↻ Re-infer**: you will see the services, databases and queues the project really uses. [Architecture](../architecture/)
5. Ask in the chat: *"explain how a booking request flows through this project"*.
6. Write a spec with what you are going to change and start with the smallest task. The first `si aplicar` will show you the whole cycle with a checkpoint.

**Outcome:** a map of the system, an initial ADR and debt that starts already paid down (`onboard` removes 10 points).

## 2. Start a new project from an idea

**For:** whoever has an idea and an empty folder.

1. Type the idea in the chat just as you have it: *"I have an idea for an app to book padel courts with payment and reminders"*. It goes to the idea inbox with a proposed objective, scope and out-of-scope. [Work](../work/#ideas-that-are-not-tasks-yet)
2. When it is clear, type `promover` to turn it into an epic of `spec.md`.
3. Want a complete first draft without your idea leaving the machine? Use **Generate Specification (Local Model)**. [Local engine](../local-engine/)
4. Order and refine the tasks by hand. Small, verifiable, starting with a verb.
5. If you want the folder structure done, use the **Project Builder** skill with the stack you prefer. [Agents](../agents/)
6. Run `onboard` as soon as there is a `package.json`, `pom.xml` or similar, so the harness knows your build and test commands.
7. Work task by task from the board.

## 3. Work without your code leaving your machine

**For:** teams with confidential code, personal data or compliance requirements.

1. Install **Ollama** and pull a 7B or larger code model if your machine can run it. [Providers](../providers/#ollama)
2. Set `alpaquitay-ai.preferredProvider: "ollama"` so a cloud provider is never picked by accident, and **do not store** Anthropic or OpenAI keys.
3. Use the **local engine** for specs: the only network it uses is the one-time signed model download.
4. Check that the harness strip says `privacy on-device`.
5. For a network without Internet, serve the models from your own CDN with your key (`cdnBaseUrl` + `extraTrustedKeys`). [Models](../models/#publishing-a-model-on-your-own-cdn)

> [!TIP]
> Telemetry is already off. With a local provider, Alpaquitay makes no network request with your code.

## 4. Write, proofread and publish a book

**For:** authors and documentation teams.

1. Write the manuscript in Markdown (one file per chapter or a single one) or in Word.
2. In **Docs**, open the document and run **Consistency check**: names, dates, places and terminology that do not match across chapters. [Docs](../docs/)
3. Run **Outline** and **Editorial feedback** to see the structure and what is missing.
4. Proofread chapter by chapter with **Proofread**. Apply *Only safe* first and review the ones flagged *review* by hand.
5. An edition in another language? **Translate to** writes a new file and leaves the original untouched.
6. Convert the final Markdown to **EPUB** in one click. In Word, edits arrive as tracked changes for your editor to accept or reject.

## 5. Make and record an architecture decision

**For:** architects and tech leads.

1. In **Architecture**, click **↻ Re-infer** to start from the real system.
2. With **▲ AI**, ask for the alternative: *"extract the payments module into its own service with a queue between them"*.
3. Click **▲ Assess** to compare quality attributes and risks.
4. Click **ADR**, describe the context and the decision and create the record in `.alpaquitay/adrs/`.
5. Ask in the chat *"generate a C4 container diagram of this system"* to prepare the explanation for each audience.
6. Export a **Terraform**, CDK, Bicep or GCP skeleton as a starting point for the platform team. [Architecture](../architecture/#exporting-infrastructure-as-code)

## 6. Review security before a release

**For:** teams that ship software and want a structured review.

1. Ask in the chat *"build a STRIDE threat model of the payments flow"* and confirm with `si`: the DevSecOps specialist handles it. [Agents](../agents/#domain-specialists)
2. Ask *"generate an SBOM for this project"* and *"assess our pipeline against OWASP SAMM"*.
3. Review the pending diffs in **Evidence**: the automatic review blocks literal secrets and files outside the sources. [How the harness thinks](../harness/#what-guards-a-write)
4. Check that the release's tasks are in *Done* with the DoD gate passed, not just ticked.

## 7. Follow a team's delivery

**For:** tech leads and engineering managers.

1. Ask the team to link their commits with `#SPEC-xxx`. [Work](../work/#linking-commits-to-tasks)
2. Look at **Evidence**: repository signal, debt and review queue. [Evidence](../evidence/)
3. Commit `.alpaquitay/decisions.jsonl` and `debt.json` to keep an auditable history of what the harness decided and why.
4. If debt passes 70, stop and pay it down: apply or discard diffs, close tasks with evidence and run `onboard` again if the stack changed.

> [!NOTE]
> Alpaquitay's DORA figures come from Git and are labelled as **signals**, not operational metrics. For management decisions, combine them with your real deployment and incident data.
