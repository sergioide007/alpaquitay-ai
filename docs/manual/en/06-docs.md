---
title: "Docs: documents with an agent"
nav: Docs · documents with an agent
description: How to proofread, restyle, translate, summarise and check the consistency of Word, Markdown, EPUB and PDF documents with the Docs tab agent, reviewing every change before it is applied.
---

# Docs: documents with an agent

The **Docs** tab is for everything that is not code: manuscripts, reports, articles, documentation and books. You talk to the agent in English or Spanish, as you would to an editor:

> *"proofread chapter 3"* · *"make it more direct, keep my voice"* · *"translate the book to Spanish"* · *"check consistency across chapters"* · *"what is this chapter missing?"*

```video
title: An editorial report on a document
src: media/docs-agent-en.mp4
poster: media/docs-agent-en.jpg
duration: 1:11
caption: A Markdown file from the project is opened, *Editorial feedback* is requested and the agent returns strengths, problems and concrete suggestions, saved as .md. The document is not modified. The sample document is in Spanish, so the report is too. Recorded with Ollama (llama3.2 3B), sped up while waiting.
```

## Formats

| Format | Read | Write | Notes |
|---|---|---|---|
| `.docx` (Word) | ✅ | ✅ | Edits are written as Word **tracked changes** (Review → Accept/Reject). Untouched paragraphs stay byte-identical. |
| `.md` / `.txt` | ✅ | ✅ | Lossless outside the edited blocks; code blocks, tables and front matter are protected. |
| `.epub` | ✅ | ✅ | Chapters follow the book's spine; italics and bold survive a round trip. |
| `.pdf` | ✅ | ➡️ `.md` | Read-only, best effort (text-based PDFs). A scanned PDF needs OCR first. |

From the same tab you can **convert** any document to **Markdown**, **Word** or **EPUB**: a manuscript in Markdown becomes a publishable EPUB in one click.

## Step by step

![The Docs tab with an open document and the agent's actions](media/hub-docs.png "The Docs tab: an open document, quick actions and the conversation with the agent.")

1. **Open a document** with *Open file…* or pick it from *Documents in this workspace…*.
2. **Choose an action** or type your own instruction:
   - **Edit:** *Proofread* (spelling and grammar), *Improve style*, *Shorten*, *Translate to* (English, Spanish, French, German, Italian or Portuguese).
   - **Analyse:** *Summarize*, *Outline*, *Consistency check* (names, dates, places and terminology across chapters) and *Editorial feedback*.
3. **Review the proposal.** Every changed paragraph shows a **word-level diff**. Large rewrites, changed numbers and big length changes are flagged *review* and are **not pre-selected**.
4. **Select** with *Select all*, *Only safe* or *None*, or box by box.
5. **Click *Apply selected*.** By default a **new file** is written (`name.edited.docx`, `name.edited.md`…). If you choose to overwrite, a backup is saved first in `.alpaquitay/backups/`.
6. **Verification.** The written file is read back to check that it opens and contains every accepted edit.

Analyses (summary, outline, consistency, feedback) do not change the document: save them with *Save report as .md*.

![The document agent flow](diagrams/10-docs-agent.svg "Format adapters, intent, confirmation, run, review, apply and verify.")

## The same guarantees as for code

- The agent only **proposes**; you decide what is applied.
- **Protected blocks it never touches:** links, footnotes, fields, images, tables and code.
- **Whole books:** if an operation needs more than 20 model calls it asks you first (*Continue*), and it never makes more than 60.
- **Privacy:** with a cloud provider the text goes through the privacy boundary (personal data and secrets hidden); with a local model the manuscript never leaves your machine.
- **No external dependencies:** the ZIP, DOCX, EPUB and PDF readers and writers are built in, so the extension stays small and auditable.

## Limits, stated plainly

- In a Word paragraph the agent rewrites, the formatting inside that paragraph (a bold word, for example) is replaced by the formatting of its first run. Tracked changes show exactly what changed.
- Paragraphs with hyperlinks, fields or notes are **skipped** rather than risk damaging them.
- Quality depends on the model. In our tests a 3B local model (`llama3.2:3b`) wrote a useful editorial report, but answered *"No changes needed"* when asked to fix a Spanish text with missing accents. To proofread, restyle or translate, use a 7B model or larger, or a cloud one.

> [!TIP]
> For a book, start with **Consistency check** and **Outline**: they change nothing and give you the big picture. Then proofread chapter by chapter with *Proofread* and take your time with the changes flagged *review*.
