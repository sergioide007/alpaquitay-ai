---
title: "Work: spec, board and chat"
nav: Work · spec, board and chat
description: How to create a spec.md with epics and tasks, move it across the Kanban board, let the AI implement a task with reviewable diffs and link commits with #SPEC.
---

# Work: spec, board and chat

The **Work** tab is where the coding happens. It has three panes: the **spec** (`spec.md`), the Kanban **board** derived from it and the **chat** with the harness. This is Alpaquitay's SDD (*spec-driven development*) flow: first agree on *what*, then implement *task by task*, and every change stays linked to a requirement.

![The Work tab with spec, board and chat](media/hub-work.png "Work: the spec on the left, the board in the middle and the chat on the right.")

```text
  spec.md ──► Board ──► the AI implements a task ──► diff ──► si aplicar ──► spec.md [x] ──► commit #SPEC-001
     ▲                                                                                          │
     └──────────────────────────────────────── feedback loop ──────────────────────────────────┘
```

## Your next step, always visible

Under the tabs, the **next-step bar** follows the SDD flow, *Spec → Build → Review → Verify*, and shows one primary button for what to do now:

| Where you are | The bar says | The button |
|---|---|---|
| No `spec.md` yet | Start with a spec | **Create spec with AI** |
| Tasks waiting | Next task: … | **Start SPEC-00x** (prioritizes in *Todo* and starts work in *In Progress*) |
| The AI is working | AI is building … | **Watch progress** |
| Diffs pending | Review N pending changes | **Review changes** and **Apply & run gates** |
| Debt at its ceiling | Build is blocked by technical debt | **See debt** |
| Every task done | All N tasks are done | **Validate against spec** |

Every card in *Backlog*, *Todo* and *In Progress* also has a **Start** (or **Resume**) button, so dragging is optional. Above the chat input, quick buttons run *Build next task*, *Validate*, *Tests* and *Refactor*; when diffs are pending, **Review and apply** and **Discard changes** appear.

| Shortcut | Action |
|---|---|
| <kbd>Ctrl</kbd>+<kbd>K</kbd> (<kbd>Cmd</kbd>+<kbd>K</kbd> on macOS) | Open the command palette: every tab, action and agent, searchable |
| <kbd>Alt</kbd>+<kbd>1</kbd> to <kbd>7</kbd> (<kbd>Option</kbd> on macOS) | Switch tab |
| <kbd>/</kbd> | Focus the chat |

## 1. The spec (`spec.md`)

`spec.md` is plain Markdown at the root of your project, and it is **the board's database**: card state is read from this file, not stored elsewhere. So you can edit it by hand, review it in a pull request and version it like any other file.

```markdown
# Club booking portal

Court bookings with online payment and email reminders.

## Epic: Bookings
- [ ] SPEC-001 Build the calendar of free courts
- [ ] SPEC-002 Let a member book a court for one hour
- [x] SPEC-003 Design the bookings data model

## Epic: Payments
- [ ] SPEC-004 Charge the booking through the payment gateway
- [ ] SPEC-005 Email the receipt
```

Format rules:

- A `# Title` and a paragraph of context at the top.
- Each `## Epic: …` (or any level-2 heading) groups tasks.
- `- [ ] text` is a pending task; `- [x] text` a finished one.
- The IDs `SPEC-001`, `SPEC-002`… are assigned by position.
- Free text between tasks is used as context for the AI.

Does your project use another name, such as `tasks.md` or `backlog.md`? Change it in **Settings → Workspace → Spec file** (`alpaquitay-ai.specFile`). If the file does not exist, Alpaquitay looks for similar ones.

### Three ways to create it

| How | When | Where |
|---|---|---|
| **+ Create with AI** / **Regen** | You have a provider and want the AI to analyse the workspace. *Regen* takes an optional project description. | The Hub's *Spec* pane. |
| **Generate Specification (Local Model)** | Your description must not leave your machine. It writes `specs/<name>.md` and never overwrites. | Command Palette or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>A</kbd>. See [Local engine](../local-engine/). |
| **By hand** | You already know what you want. | Any editor. Click ↻ in the *Spec* pane to reload. |

> [!TIP]
> A good spec has small, verifiable tasks that start with a verb: "Validate the email in the sign-up form" beats "Users". The AI implements a task of a couple of files far better than a whole epic.

## 2. The board

Every pending task starts in **Backlog**. The usual flow is **Backlog → Todo → In Progress → Done**: move a task to *Todo* to prioritize it, then press **Start** to begin. Review happens within *In Progress*; it is not a fifth column.

```video
title: A board task, end to end
src: media/work-task-en.mp4
poster: media/work-task-en.jpg
duration: 0:29
caption: SPEC-003 is started from the board; the agent proposes a diff to review and apply. Tests pass but the build fails (the sample project has no `vite` installed), so the DoD gate keeps the card in In Progress and explains what is missing. Recorded with Ollama (llama3.2 3B), sped up while waiting.
```

**Starting a card from *Todo* (or moving it to *In Progress*) starts the AI**, and it writes nothing blindly:

1. **Plan.** The agent looks at the workspace and decides which files to create or change (6 at most). Paths that would leave the project are dropped; a path the model writes as `/api/x.js` is read as `api/x.js` inside the project.
2. **Generate.** It generates each file and stores it as a **pending diff**. The chat shows each diff (`+added/−removed`).
3. **Your review.** Read the diffs. Use `diff <path>` to see one in full.
4. **Review and apply or discard.** Choose **Review and apply** to process the changes with the policy, automatic review and checkpoint described in [How the harness thinks](../harness/#what-guards-a-write), or **Discard changes** to discard them. You can also use `si aplicar` and `no` in chat.
5. **Verify.** After applying, the real build and test commands run.
6. **Done.** The card moves to *Done* and `spec.md` becomes `- [x]` **only if** the DoD gate has evidence. Otherwise it stays *In Progress* and the chat explains what is missing.

If an older task contains an example path such as `<carpeta-fuente>/services/validator.ts`, the harness resolves it using the detected source folder (or the workspace root), refreshes the preview at the real path, and asks for confirmation again. If the file changed since the diff was generated, it will not overwrite it; the proposal stays pending so you can regenerate it. A failed diff remains pending while other diffs continue processing. If the workspace is not a Git repository, applying continues with a warning that no checkpoint could be created.

![Task sequence: plan, generate, diff, approve, apply, prove](diagrams/03-sdd-task-sequence.svg "What happens between dragging the card and it reaching Done.")

The **Evidence** tab shows the same review queue with buttons (*Discard all* and *Apply & run gates*). Review is a task state while it stays in *In Progress*, not an extra board column.

> [!IMPORTANT]
> While working a task, the AI **cannot write `spec.md`**: if it tries, that write is skipped. A confused model cannot wipe your checkboxes. The board updates `spec.md` itself when the task reaches *Done*.

If the model call fails, the error shows in the chat and the card goes back to its column: no silent failures.

## 3. The chat

The chat in the right pane understands three kinds of message:

- **Natural language.** The harness picks the lane (Flash, Build or Deep), shows its decision and asks for confirmation when needed. See [How the harness thinks](../harness/#the-three-lanes).
- **Harness commands**, such as `onboard`, `dora`, `deuda` or `si aplicar`. Most of them use no model calls. They are all in [Chat commands](../chat-commands/).
- **Skills**, with the **/skill** button: create a file, refactor, generate tests, the daily standup… See [Agents](../agents/).

## Ideas that are not tasks yet

Type a messy idea ("I have an idea: members could book with priority…"). The harness recognises the *Flash · ideate* lane and files it in the **idea inbox** (`.alpaquitay/ideas.json`) with a proposed objective, scope and out-of-scope. When it is clear, type `promover` and the latest idea becomes a new epic in `spec.md`.

## Linking commits to tasks

Mention the task in the commit message:

```text
feat(bookings): calendar of free courts #SPEC-001

Shows the free slots for the next 7 days.
```

Both `#SPEC-001` and `[SPEC: 001]` are recognised. The **Evidence** tab marks those commits in the history and counts them in the repository signals: the more linked commits, the better the traceability.

## Generate from Spec and Validate Against Spec

Besides the board, the quick menu has two classic commands that work with **any spec file** (`.md`, `.yaml`, `.yml`, `.json` or `.feature`):

- **Generate from Spec** picks a file, plans the files it needs and generates them.
- **Validate Against Spec** compares the project's code with the spec and reports what does not comply.

> [!WARNING]
> *Generate from Spec* **writes the files directly**, with no diff and no `si aplicar`, and can overwrite files with the same name. Use it on a clean Git tree so you can review the result with `git diff` and undo it if needed. For reviewed work, use the board.

**New Specification** creates a template in `specs/`: REST API (OpenAPI 3.0), BDD feature (Gherkin), database schema, Spring Boot microservice or React component.
