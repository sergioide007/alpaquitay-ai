from dlib import *

W, H = 1120, 1046
d = D(W, H, 'Harness architecture', 'From request to evidence: the harness pipeline',
      'Every request is perceived, routed to one lane, previewed before any write, guarded, verified and logged.', '01-harness-pipeline')

# ── Row 1: perceive & decide ────────────────────────────────────────────────
y1 = 122
c_req = d.card(40, y1, 200, 'Developer request', 'Chat message · Kanban drag · harness command', GRAY, h=92)
c_fp = d.card(280, y1, 270, 'Perceive', 'WorkspaceFingerprinter detects stack, source dirs and markers. Never assumes src/.', SIGNAL, h=92, tag='F')
c_dec = d.card(590, y1, 490, 'Decide', 'SdlcRouter picks phase + gate; Decider picks route, lane and confidence. Risky or low-confidence routes ask first (si). Every reply shows a chip: lane · stack · phase · gate · DoD · economy.', BLUE, h=92, tag='A')
d.badge(1080 - 42, y1 + 18, 'L', BLUE)
d.arrow([c_req.right(), c_fp.left()], MUTED)
d.arrow([c_fp.right(), c_dec.left()], MUTED)

# router bus
bus_y = 246
lanes = {'flash': (40, 240, AMBER), 'build': (300, 520, SIGNAL), 'deep': (840, 240, PURPLE)}
d.arrow([(960, c_dec.b), (960, 270)], BLUE)
d.add(f'<path d="M160,{bus_y} L960,{bus_y}" stroke="{BLUE}" stroke-width="1.6" fill="none"/>')
d.text(500, bus_y - 8, 'route → exactly one lane', 10.5, BLUE, mono=True, anchor='middle')
for k, (x, w, col) in lanes.items():
    cx = x + w / 2
    if k == 'deep':
        continue
    elif k == 'build':
        pts = [(cx, bus_y), (cx, 270)]
        d.add(f'<path d="M{cx},{bus_y} L{cx},{bus_y}" />')
    else:
        pts = [(cx, bus_y), (cx, 270)]
    d.arrow(pts, BLUE)

# ── Lanes ──────────────────────────────────────────────────────────────────
ly = 278
LH = 568
# FLASH
fx, fw = 40, 240
d.group(fx, ly, fw, LH, 'Flash', AMBER, 'local · free')
y = ly + 26
a = d.card(fx + 14, y, fw - 28, 'Chat & Q&A', 'Short questions and explanations answered right away.', AMBER); y = a.b + 12
b = d.card(fx + 14, y, fw - 28, 'Idea inbox', 'IdeaInbox captures loose ideas; promover turns the last one into a spec.md epic.', AMBER); y = b.b + 12
c = d.card(fx + 14, y, fw - 28, 'Harness commands', 'onboard · dora · deuda · economía · postmortem · diff · si · no. Computed locally, zero LLM calls.', AMBER); y = c.b + 12
d.card(fx + 14, y, fw - 28, 'Cost', 'Counted as local operations in the session economy.', GRAY, dash='4 3', fo=.03)

# BUILD
bx, bw = 300, 520
d.group(bx, ly, bw, LH, 'Build', SIGNAL, 'spec-driven, diff-first')
d.pill(bx + bw - 214, ly - 11, 'blocked when debt ≥ 100', RED, 10.5, True, 8, 22)
inner_x, inner_w = bx + 16, bw - 32
y = ly + 24

def sub(y, label, col, rows):
    """A tinted sub-phase with compact step rows. Returns (bottom, [boxes])."""
    d.text(inner_x + 2, y + 10, label, 10.5, col, True, mono=True, ls=.4)
    y += 20
    boxes = []
    for (t, bd, tag) in rows:
        r = d.row(inner_x, y, inner_w, t, bd, col, 112, tag=tag)
        boxes.append(r); y = r.b + 8
    return y, boxes

y, p1 = sub(y, '1 · PROPOSE — nothing is written', SIGNAL, [
    ('Plan', 'LLM lists up to 6 file paths. spec.md is protected from AI writes.', None),
    ('Generate', 'One completion per file; small-model aware prompts.', None),
    ('Diff preview', 'Unified diff, bounded to 6 files · 120 lines. Stored as pending.', 'B'),
])
y += 4
y, p2 = sub(y, '2 · APPROVE — human in the loop', AMBER, [
    ('Ask', 'si aplicar writes everything · no discards · diff <path> shows a file.', 'A'),
    ('PolicyGuard', 'allow | confirm | deny. Denies .env, keys, secrets/ and credentials.', None),
    ('AgentReview', 'Local check: secrets, scope vs. evidenced sources, SRP, debug leftovers.', None),
])
y += 4
y, p3 = sub(y, '3 · APPLY & PROVE — Done requires evidence', BLUE, [
    ('Checkpoint', 'git stash --include-untracked before the first write. Reversible.', None),
    ('Write', 'FilesystemMCP on a validated workspace root (fix for EROFS).', None),
    ('Build + tests', 'Real commands must run and exit 0 → QualityEvidence.', None),
    ('DoD gate', 'No pending diffs + verified contract + evidence → Done, else blocked.', None),
])
allb = p1 + p2 + p3
for i in range(len(allb) - 1):
    a, b = allb[i], allb[i + 1]
    d.arrow([(a.cx - 180, a.b), (a.cx - 180, b.y)], MUTED, sw=1.3)

# DEEP
dx, dw = 840, 240
d.group(dx, ly, dw, LH, 'Deep', PURPLE, 'specialists')
y = ly + 26
s1 = d.card(dx + 14, y, dw - 28, 'SpecialistRouter', 'Ranks agents from routing hints + the catalog. One shell, one completion, ≤ 16k chars.', PURPLE); y = s1.b + 12
s2 = d.card(dx + 14, y, dw - 28, 'PrivacyGuard', 'Redacts PII before anything leaves the machine.', PURPLE); y = s2.b + 12
s3 = d.card(dx + 14, y, dw - 28, 'Domain shell', '17 registered shells. Runs a use case, then checks guardrails: block · warn · pass.', PURPLE); y = s3.b + 12
s4 = d.card(dx + 14, y, dw - 28, 'Route receipt', 'One auditable receipt per route: shell, use case, confidence, reasons.', PURPLE)
for a, b in [(s1, s2), (s2, s3), (s3, s4)]:
    d.arrow([(a.cx, a.b), (a.cx, b.y)], MUTED, sw=1.3)

# ── Evidence layer ─────────────────────────────────────────────────────────
ey = ly + LH + 38
d.group(40, ey, 1040, 92, 'Evidence layer', SIGNAL, '.alpaquitay/ in the workspace · plain files, git-friendly')
d.badge(1080 - 22, ey, 'E', SIGNAL)
files = [('decisions.jsonl', 'routes · blocks · reviews'), ('debt.json', 'debt score · ceiling 100'),
         ('economy.json', 'LLM vs local ops'), ('platform.json', 'golden path'),
         ('memory.json', 'project memory'), ('ideas.json', 'idea inbox'), ('arch.json', 'architecture')]
px, py = 58, ey + 30
for f, desc in files:
    w = max(tw(f, 11.5, True, True), tw(desc, 10.5)) + 24
    if px + w > 1066:
        px, py = 58, py + 46
    d.rect(px, py, w, 38, SIGNAL, SIGNAL, 1, 7, None, .07, .45)
    d.text(px + 12, py + 15, f, 11.5, TEXT, True, mono=True)
    d.text(px + 12, py + 30, desc, 10.5, MUTED)
    px += w + 10
for cx in (160, 560, 960):
    d.arrow([(cx, ly + LH), (cx, ey)], SIGNAL, dash='4 3', sw=1.3)

d.legend(40, H - 40, [(SIGNAL, 'Build lane / evidence'), (AMBER, 'Flash lane / approval'), (PURPLE, 'Deep lane'), (BLUE, 'Routing / proof')])
d.text(1080, H - 40, 'F · A · B · L · E = FABLE-5 principles', 11, MUTED, anchor='end', mono=True)
d.save('docs/diagrams')
