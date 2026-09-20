from dlib import *
W, H = 1120, 968
d = D(W, H, 'New · Docs tab', 'Document agent: edit any Word, Markdown, EPUB, PDF or text file',
      'Same harness contract as code: the agent proposes, you approve a word-level diff, the harness writes and verifies.', '10-docs-agent')
# formats
fx = [('.docx', 'Word', 'read + write · tracked changes', SIGNAL), ('.md / .txt', 'Markdown · text', 'read + write · lossless outside edits', SIGNAL),
      ('.epub', 'Books', 'read + write · <em>/<strong> preserved', SIGNAL), ('.pdf', 'PDF', 'read-only · edits saved as .md', AMBER)]
fw = (1040 - 3 * 14) / 4
fb = [d.card(40 + i * (fw + 14), 122, fw, f'{a}  ·  {b}', c, col, h=64, bsize=11) for i, (a, b, c, col) in enumerate(fx)]
ld = d.card(40, 234, 1040, 'Adapters → LoadedDocument', 'ZipLite (own ZIP reader/writer, no dependencies) · DocxAdapter · EpubAdapter · MarkdownAdapter · PdfReader. Output: sections (chapters) → blocks with exact source ranges. Code, tables, links, footnotes, fields and images are PROTECTED blocks the agent can never touch.', BLUE, h=86)
for b in fb: d.arrow([b.bot(), (b.cx, ld.y)], MUTED)
# intent
it = d.card(40, 348, 500, 'Intent · deterministic, no LLM (Flash lane)', 'ES/EN patterns → proofread · style · shorten · expand · translate · custom (edit)   or   summarize · outline · consistency · feedback · ask (analyze).', AMBER, h=86)
gate = d.card(580, 348, 500, 'Ask before act', 'Scope = whole document or one chapter. Above 20 model calls the tab asks for confirmation; hard limit 60. Cloud providers show a PII-redaction notice.', AMBER, h=86, tag='A')
d.arrow([(it.cx, ld.b), (it.cx, it.y)], MUTED); d.arrow([it.right(), gate.left()], MUTED)
# agent
ag = d.card(40, 466, 500, 'Edit run', 'Batches ≤ 5 000 chars (2 200 for small local models) → prompt with numbered [[id]] paragraphs → the model returns only the changed ones. Unknown ids are dropped.', SIGNAL, h=96)
an = d.card(580, 466, 500, 'Analysis run', 'Map-reduce over chapters: summaries, fact sheets for cross-chapter consistency, developmental notes, outline, Q&A over the most relevant chapters → Markdown report.', PURPLE, h=96)
d.arrow([(gate.cx - 150, gate.b), (gate.cx - 150, gate.b + 16), (ag.cx, gate.b + 16), (ag.cx, ag.y)], MUTED); d.arrow([(an.cx, gate.b), (an.cx, an.y)], MUTED)
prov = d.card(40, 594, 1040, 'AIProviderManager', 'Local model (Ollama / LM Studio: private, free) or cloud behind PrivacyBoundaryProvider (PII and secrets redacted, restored on return).', BLUE, h=64)
d.arrow([ag.bot(), (ag.cx, prov.y)], MUTED, dash='4 3'); d.arrow([an.bot(), (an.cx, prov.y)], MUTED, dash='4 3')
# review
rv = d.card(40, 690, 500, 'Proposed changes · risk gate', 'Word-level diff per paragraph. Unusually large rewrites, changed numbers or big length changes are flagged “review” and are NOT pre-selected.', AMBER, h=92, tag='B')
ap = d.card(580, 690, 500, 'Apply · PolicyGuard · new file first', 'Output is a NEW file by default. Overwrite makes a backup in .alpaquitay/backups. Word edits are written as tracked changes (Accept / Reject in Word).', SIGNAL, h=92)
d.arrow([(rv.cx, prov.b), (rv.cx, rv.y)], MUTED); d.arrow([rv.right(), ap.left()], MUTED)
vf = d.card(40, 810, 500, 'Verify', 'The written file is re-read: it must parse, keep the same block count, and contain every accepted edit.', SIGNAL, h=76, tag='E')
ev = d.card(580, 810, 500, 'Evidence', 'decisions.jsonl entry · debt +/− · economy (LLM calls vs local) · reports and exports saved next to the source.', SIGNAL, h=76)
d.arrow([(ap.cx - 150, ap.b), (ap.cx - 150, ap.b + 16), (vf.cx, ap.b + 16), (vf.cx, vf.y)], MUTED); d.arrow([vf.right(), ev.left()], MUTED)
d.legend(40, H - 40, [(SIGNAL, 'Read / write / verify'), (AMBER, 'Gates'), (BLUE, 'Adapters / providers'), (PURPLE, 'Analysis')])
d.save('docs/diagrams')
