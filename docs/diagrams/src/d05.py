from dlib import *

W, H = 1120, 914
MGR_H = 552
d = D(W, H, 'Runtime design · AI providers', 'Provider selection and the privacy boundary',
      'Local models run untouched. Anything that leaves the machine is redacted first and audited without values.', '05-provider-privacy')

# ── Column A: callers ────────────────────────────────────────────────────────
ax, aw = 40, 160
d.group(ax, 140, aw, 340, 'Callers', GRAY)
cs = []
y = 166
for t, b in [('Hub chat', 'streaming answers'), ('Task engine', 'plan + generate'), ('Skills', 'built-in & custom'), ('Domain shells', 'via adapters')]:
    c = d.card(ax + 12, y, aw - 24, t, b, GRAY, h=58); cs.append(c); y = c.b + 10
callers_bot = y

# ── Column B: AIProviderManager ──────────────────────────────────────────────
bx, bw = 260, 340
d.group(bx, 140, bw, MGR_H, 'AIProviderManager', BLUE, 'one active provider at a time')
y = 172
r1 = d.card(bx + 14, y, bw - 28, '1 · Register', 'Ollama and LM Studio are always registered. Anthropic and OpenAI only when their key exists in the OS keychain.', BLUE); y = r1.b + 14
# decision
dy = y
d.rect(bx + 14, dy, bw - 28, 92, BLUE, BLUE, 1.2, 8, None, .07, .55)
d.rect(bx + 14, dy + 6, 3, 80, BLUE, rx=1.5)
d.text(bx + 30, dy + 25, '2 · Select', 13, TEXT, True)
d.para(bx + 30, dy + 44, 'preferredProvider set and available?', 11.5, MUTED, maxw=bw - 60)
d.pill(bx + 30, dy + 58, 'yes → use it', SIGNAL, 10.5, True, 8, 22)
d.pill(bx + 30 + 108, dy + 58, 'auto → first available', AMBER, 10.5, True, 8, 22)
y = dy + 92 + 12
# priority chain
chain = ['Ollama', 'LM Studio', 'Anthropic', 'OpenAI']
d.text(bx + 16, y + 12, 'AUTO PRIORITY — local first, for privacy', 10, DIM, True, mono=True, ls=.8)
y += 22
cw = (bw - 28 - 3 * 12) / 4
chain_boxes = []
for i, nme in enumerate(chain):
    col = SIGNAL if i < 2 else BLUE
    x = bx + 14 + i * (cw + 12)
    d.rect(x, y, cw, 36, col, col, 1.2, 8, None, .12, .7)
    d.text(x + cw / 2, y + 22, nme, 10.5, TEXT, True, 'middle', maxw=cw - 6)
    chain_boxes.append((x, cw))
    if i:
        d.arrow([(x - 12 + 1, y + 18), (x - 1, y + 18)], MUTED, sw=1.3)
y += 36 + 16
r3 = d.card(bx + 14, y, bw - 28, '3 · Classify destination', 'Loopback endpoint (127.0.0.1, localhost) → local. Anthropic, OpenAI and any remote Ollama / LM Studio URL → cloud.', BLUE); y = r3.b + 14
r4 = d.card(bx + 14, y, bw - 28, '4 · Optional hooks', 'Hybrid LLM route (Cline · LangChain) replaces the core call; a tracer (LangSmith) records every call.', PINK, dash='4 3'); y = r4.b + 14
mgr_bottom = y
d.arrow([(ax + aw, 290), (bx, 290)], MUTED, label='chat()', lpos=.5)

# ── Column C: destinations ──────────────────────────────────────────────────
cx0, cwid = 660, 420
# LOCAL
ly0, lh = 140, 150
d.group(cx0, ly0, cwid, lh, 'Local path', SIGNAL, 'loopback endpoint', fo=.04)
l1 = d.card(cx0 + 14, ly0 + 24, (cwid - 42) / 2, 'OllamaProvider', 'POST /api/chat\nstream · num_predict', SIGNAL, h=76)
l2 = d.card(cx0 + 28 + (cwid - 42) / 2, ly0 + 24, (cwid - 42) / 2, 'LMStudioProvider', 'OpenAI-compatible\nlocalhost:1234', SIGNAL, h=76)
d.text(cx0 + 16, ly0 + lh - 12, 'Undecorated · zero overhead · zero egress', 11, SIGNAL, False)
# CLOUD
STEPS = [
    ('1', 'Redact', 'PII: email, phone, card, SSN, IBAN. Secrets: API keys, bearer tokens, JWT, private keys, AWS keys.'),
    ('2', 'Send', 'Only the sanitized prompt is sent to the provider.'),
    ('3', 'Return', 'The reply comes back as sent; placeholders are not reversed.'),
    ('4', 'Disclose', 'Value-free record: counts and categories only, never content.'),
]
cy0 = 320
PBH = 36 + 4 * 8 + 12 + sum(max(46, len(wrap(b, 11, cwid - 52 - 104 - 10)) * 16 + 18) for _, _, b in STEPS)
d.group(cx0, cy0, cwid, 26 + PBH + 22 + 76 + 16, 'Cloud path', BLUE, 'leaves the machine', fo=.03)
pb = cy0 + 26
d.rect(cx0 + 14, pb, cwid - 28, PBH, AMBER, AMBER, 1.3, 9, None, .06, .7)
d.text(cx0 + 30, pb + 22, 'PrivacyBoundaryProvider', 13, TEXT, True)
d.text(cx0 + cwid - 30, pb + 22, 'facade', 10.5, AMBER, False, 'end', True)
steps = STEPS
if 0: steps = [
    ('1', 'Redact', 'PII: email, phone, card, SSN, IBAN. Secrets: API keys, bearer tokens, JWT, private keys, AWS keys.'),
    ('2', 'Send', 'Only the sanitized prompt is sent to the provider.'),
    ('3', 'Return', 'The reply comes back as sent; placeholders are not reversed.'),
    ('4', 'Disclose', 'Value-free record: counts and categories only, never content.'),
]
sy = pb + 36
prev = None
for n, t, b in steps:
    lines = wrap(b, 11, cwid - 52 - 104 - 10)
    h = max(46, len(lines) * 16 + 18)
    d.rect(cx0 + 26, sy, cwid - 52, h, AMBER, AMBER, 1, 7, None, .07, .45)
    d.badge(cx0 + 46, sy + h / 2, n, AMBER, 10)
    d.text(cx0 + 66, sy + h / 2 + 4.5, t, 12.5, TEXT, True)
    for i, ln in enumerate(lines):
        d.text(cx0 + 26 + 104, sy + h / 2 - (len(lines) - 1) * 8 + 4 + i * 16, ln, 11, MUTED, maxw=cwid - 52 - 104 - 10)
    prev = sy + h
    sy = prev + 8
pb_bottom = pb + PBH
pa = d.card(cx0 + 14, pb_bottom + 22, (cwid - 42) / 2, 'AnthropicProvider', 'POST /v1/messages\nSSE stream', BLUE, h=76)
po = d.card(cx0 + 28 + (cwid - 42) / 2, pb_bottom + 22, (cwid - 42) / 2, 'OpenAIProvider', 'chat completions\nbaseUrl override (Azure)', BLUE, h=76)
d.arrow([(cx0 + cwid / 2, pb_bottom), (cx0 + cwid / 2, pb_bottom + 22)], AMBER, head=False)
d.add(f'<path d="M{pa.cx},{pb_bottom + 12} L{po.cx},{pb_bottom + 12}" stroke="{AMBER}" stroke-width="1.6" fill="none"/>')
d.arrow([(pa.cx, pb_bottom + 12), (pa.cx, pa.y)], AMBER)
d.arrow([(po.cx, pb_bottom + 12), (po.cx, po.y)], AMBER)

# routing arrows manager -> lanes
d.arrow([(bx + bw, 228), (cx0, 228)], SIGNAL, label='local', lcolor=SIGNAL)
d.arrow([(bx + bw, 470), (cx0, 470)], BLUE, label='cloud', lcolor=BLUE)

# return path band
ry = 792
d.group(40, ry, 1040, 66, 'Return path', SIGNAL, 'same for every provider', fo=.03)
d.text(60, ry + 32, 'response', 12, TEXT, True)
xx = 60 + tw('response', 12, True) + 12
for lab, col in [('as sent, no detokenize', AMBER), ('SSE chunks → webview chat-chunk', SIGNAL), ('chat-done', SIGNAL), ('disclosure counts → Hub “Privacy boundary” card', BLUE)]:
    d.arrow([(xx, ry + 28), (xx + 22, ry + 28)], MUTED, sw=1.4)
    xx += 30
    b = d.pill(xx, ry + 17, lab, col, 11, False, 10, 24)
    xx = b.r + 8
print('mgr_bottom', mgr_bottom, 'cloud_bottom', cy0 + 26 + PBH + 22 + 76 + 16)
d.save('docs/diagrams')
