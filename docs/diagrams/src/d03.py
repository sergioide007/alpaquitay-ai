from dlib import *

cols = [144, 352, 560, 768, 976]
names = [('Developer', 'Kanban board · chat', GRAY), ('Hub · MainPanel', 'task engine', BLUE),
         ('AI provider', 'local or cloud', PURPLE), ('Harness guards', 'PolicyGuard · Review · DoD', AMBER),
         ('Workspace & git', 'files · stash · build', CYAN)]

# ── events: (kind, ...) ─────────────────────────────────────────────────────
E = [
 ('band', '1 · PLAN', SIGNAL),
 ('msg', 0, 1, 'drag card → In Progress', GRAY, False, True, (1, 'Preflight: writable workspace root, else chat mode', BLUE)),
 ('msg', 1, 2, 'PLAN · ≤ 6 file paths', PURPLE, False, True, None),
 ('msg', 2, 1, 'paths (retry once if prose)', PURPLE, True, False, None),
 ('band', '2 · GENERATE & PREVIEW', SIGNAL),
 ('msg', 1, 2, 'GENERATE · one file at a time', PURPLE, False, True, None),
 ('msg', 2, 1, 'file content', PURPLE, True, False, None),
 ('msg', 1, 3, 'guardWrite + FileDiff(before, after)', AMBER, False, True, (3, 'Denied paths are skipped. The rest is stored as a pending diff — nothing is written yet.', AMBER)),
 ('msg', 1, 0, 'diff preview (bounded)', SIGNAL, True, True, (0, 'Card shows “Review required” and stays in In Progress', SIGNAL)),
 ('band', '3 · APPROVE', AMBER),
 ('msg', 0, 1, 'si aplicar   (or: no)', AMBER, False, True, None),
 ('msg', 1, 3, 'debt ceiling · review each file', AMBER, False, True, (3, 'AgentReview: secrets · scope · SRP · debug traces. Debt ≥ 100 blocks Build.', AMBER)),
 ('band', '4 · APPLY & PROVE', BLUE),
 ('msg', 3, 4, 'checkpoint → write', BLUE, False, True, (4, 'git stash first, then FilesystemMCP writes each approved file', CYAN)),
 ('msg', 1, 4, 'run build + test commands (real exit codes)', BLUE, False, True, None),
 ('msg', 4, 1, 'QualityEvidence', BLUE, True, False, None),
 ('msg', 1, 3, 'DoD gate', AMBER, False, True, (3, 'no pending diffs · verified contract · build + tests passed', AMBER)),
 ('band', '5 · OUTCOME', PURPLE),
 ('outcome',),
]

def note_h(text, w, bsize=10.8):
    return 14 + len(wrap(text, bsize, w - 20)) * bsize * 1.42

top = 132
y = top + 48 + 30
plan = []           # (type, y, ...)
bands = []          # [start, label, color]
cur = None
NW = 196
for ev in E:
    if ev[0] == 'band':
        if cur: cur.append(y); bands.append(cur); y += 8
        cur = [y, ev[1], ev[2]]
        y += 8
    elif ev[0] == 'msg':
        y += 26
        plan.append(('msg', y, *ev[1:7]))
        adv = 14
        if ev[7]:
            c, t, col = ev[7]
            plan.append(('note', y + 10, c, t, col))
            adv = 10 + note_h(t, NW) + 12
        y += adv
    elif ev[0] == 'outcome':
        y += 8
        plan.append(('outcome', y))
        y += 104
cur.append(y + 6); bands.append(cur)
bottom = y + 6
H = bottom + 76
d = D(1120, H, 'Runtime design · sequence', 'Task execution: diff-first, and Done requires proof',
      'Dragging a card to In Progress never writes silently: changes wait as a bounded diff until approved, then build + tests decide.', '03-sdd-task-sequence')

for y0, y1, *_ in [(b[0], b[3], 0) for b in bands]:
    pass
for b in bands:
    y0, lab, col, y1 = b
    d.rect(40, y0, 1040, y1 - y0, col, col, 1, 8, None, .035, .25)
    d.text(1068, y0 + 16, lab, 10.5, col, True, 'end', True, ls=.6)
for cx in cols:
    d.add(f'<line x1="{cx}" y1="{top + 48}" x2="{cx}" y2="{bottom}" stroke="{BORDER}" stroke-width="1.3" stroke-dasharray="3 5"/>')
for cx, (n, s, col) in zip(cols, names):
    d.rect(cx - 96, top, 192, 48, col, col, 1.3, 9, None, .12, .7)
    d.text(cx, top + 20, n, 13, TEXT, True, 'middle')
    d.text(cx, top + 37, s, 10.5, MUTED, False, 'middle')

step = 0
for p in plan:
    if p[0] == 'msg':
        _, yy, a, b, label, color, dash, num = p
        xa, xb = cols[a], cols[b]
        dx = 6 if xb > xa else -6
        d.arrow([(xa + dx, yy), (xb - dx, yy)], color, dash='5 4' if dash else None, sw=1.7)
        if num:
            step += 1
            d.badge(xa + (16 if xb > xa else -16), yy - 14, str(step), color, 9)
        d.text((xa + xb) / 2 + (8 if num else 0), yy - 7, label, 11, TEXT, False, 'middle', maxw=abs(xb - xa) - 44)
    elif p[0] == 'note':
        _, yy, c, t, col = p
        lines = wrap(t, 10.8, NW - 20)
        h = note_h(t, NW)
        d.rect(cols[c] - NW / 2, yy, NW, h, BG, rx=7)
        d.rect(cols[c] - NW / 2, yy, NW, h, col, col, 1, 7, None, .10, .6)
        for i, ln in enumerate(lines):
            d.text(cols[c] - NW / 2 + 10, yy + 16 + i * 10.8 * 1.42, ln, 10.8, MUTED, maxw=NW - 20)
    elif p[0] == 'outcome':
        yy = p[1]
        d.card(64, yy, 470, 'PASS → Done', 'The card moves to Done · spec.md gets [x] · memory records the feature · agentic debt −8 · the commit references #SPEC-XXX.', SIGNAL, h=92)
        d.card(556, yy, 500, 'BLOCKED → stays in review', 'The card stays In Progress · the reason is logged (dod-blocked, debt +15) · fix the diff or run the failing command, then si aplicar again.', RED, h=92)

d.legend(40, H - 40, [(GRAY, 'Human'), (BLUE, 'Hub'), (PURPLE, 'AI'), (AMBER, 'Guards'), (CYAN, 'Workspace')])
d.text(1080, H - 40, 'dashed = response', 11, MUTED, anchor='end')
d.save('docs/diagrams')
