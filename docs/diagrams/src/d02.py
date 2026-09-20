from dlib import *

W, H = 1120, 1040
d = D(W, H, 'System architecture', 'Extension host: components and dependencies',
      'One composition root, one Hub UI, a harness core, and five pluggable capability layers.', '02-extension-architecture')

# ── Developer strip ─────────────────────────────────────────────────────────
dev = d.card(40, 118, 1040, 'Developer in VS Code', 'Ctrl+Alt+A opens the Hub · Ctrl+Shift+A opens the command menu · 6 commands in the palette · no Alpaquitay server anywhere', GRAY, h=58)

# ── Host group ──────────────────────────────────────────────────────────────
gy = 214
d.group(40, gy, 1040, 628, 'VS Code Extension Host', SIGNAL, 'TypeScript · activates on startup', fo=.02)
d.arrow([dev.bot(), (dev.cx, gy)], MUTED, label='commands')

x0, w0 = 60, 1000
root = d.card(x0, gy + 32, w0, 'extension.ts — composition root',
              'activate() builds the services and injects them: SecretManager · PrivacyManager · AIProviderManager · MCPManager · SkillRegistry · SpecManager · GitIntegration. The workspace root is validated first; without a writable root the Hub degrades to chat mode.',
              SIGNAL, h=70)

# Hub UI
hy = root.b + 34
hub = d.card(x0, hy, w0, 'MainPanel — Hub (one WebviewPanel SPA, vanilla HTML/TS, no bundler)', None, BLUE, h=96)
tabs = [('Work', 'Spec · Board · Chat'), ('Evidence', 'DORA · debt · review queue'), ('Architecture', 'C4 canvas · IaC export'),
        ('Agents', 'skills & specialists'), ('Settings', 'providers · privacy')]
tx = x0 + 16
for name, sub in tabs:
    w = 184
    d.rect(tx, hy + 40, w, 44, BLUE, BLUE, 1, 7, None, .10, .5)
    d.text(tx + 12, hy + 58, name, 12.5, TEXT, True)
    d.text(tx + 12, hy + 74, sub, 10.5, MUTED)
    tx += w + 10
d.arrow([root.bot(), hub.top()], MUTED)

# Harness core
cy = hub.b + 38
d.arrow([(hub.cx, hub.b), (hub.cx, cy)], BLUE, label='postMessage bus  ⇅', sw=1.6, lcolor=BLUE)
d.group(x0, cy, w0, 150, 'Harness core', SIGNAL, 'src/core · pure, unit-tested logic', fo=.03)
cw = (w0 - 32 - 3 * 10) / 4
core = [
    ('Reception', 'WorkspaceFingerprinter\nDecider · SpecialistRouter\nIdeaInbox', SIGNAL),
    ('SDLC & gates', 'SdlcRouter\nDefinitionOfDone\nQualityEvidence', AMBER),
    ('Diff-first guard', 'FileDiff · DiffPreview\nPolicyGuard · AgentReview\nCheckpointManager · DecisionLog', BLUE),
    ('Platform & state', 'Dora · DebtTracker · Economy\nPlatformContract · Onboard\nSpecManager · HierarchicalMemory\nWorkspaceRoot', PURPLE),
]
cxp = x0 + 16
core_boxes = []
for t, b, col in core:
    core_boxes.append(d.card(cxp, cy + 26, cw, t, b, col, h=112, bsize=11)); cxp += cw + 10

# Capability layers
ky = cy + 150 + 34
kw = (w0 - 4 * 12) / 5
caps = [
    ('AI providers', 'AIProviderManager\nAnthropic · OpenAI\nOllama · LM Studio\nPrivacyBoundaryProvider wraps every cloud call', BLUE),
    ('MCP tool layer', 'MCPManager\nFilesystemMCP\n  read · write · list\nGitMCP\n  log · status', CYAN),
    ('Skills', 'SkillRegistry\n8 built-in skills\nDeepAgent · Parallel ·\nComposite skills\nCustom (runtime)', AMBER),
    ('Domain agents', 'CentralBrainAgent\nOrchestratorAgent\nAgentRegistry\n17 domain shells\nRAG · PrivacyGuard', PURPLE),
    ('Integrations', 'optional plugins:\nLangChain · LangSmith\nCline · Notion\nDataFusion indexer\nVortex · Cursor · Windsurf', PINK),
]
cap_boxes = []
kx = x0
for t, b, col in caps:
    cap_boxes.append(d.card(kx, ky, kw, t, b, col, h=150, bsize=11, dash='4 3' if t == 'Integrations' else None)); kx += kw + 12
for cb in cap_boxes:
    d.arrow([(cb.cx, cy + 150), (cb.cx, cb.y)], MUTED, sw=1.3)
d.text(670, ky - 12, 'injected, never imported', 10.5, MUTED, anchor='middle')

# External systems
ey = gy + 628 + 46
ew = (1040 - 3 * 12) / 4
ext = [
    ('Local models', 'Ollama :11434 · LM Studio :1234\n100% on-device', BLUE),
    ('Cloud APIs', 'Anthropic · OpenAI\ndirect calls, PII-redacted, no proxy', BLUE),
    ('Workspace & git', 'spec.md · source files · git log\n.alpaquitay/ evidence files', CYAN),
    ('OS keychain', 'VS Code SecretStorage\nAPI keys, never plaintext', GRAY),
]
eb = []
ex = 40
for t_, b_, col in ext:
    eb.append(d.card(ex, ey, ew, t_, b_, col, h=74, bsize=11)); ex += ew + 12
d.text(40, ey - 10, 'EXTERNAL', 10.5, DIM, True, mono=True, ls=1.4)
P, M, S, A, I = cap_boxes
d.arrow([(P.cx - 30, P.b), (P.cx - 30, ey)], BLUE)
d.arrow([(P.cx + 30, P.b), (P.cx + 30, ey - 14), (eb[1].cx, ey - 14), (eb[1].cx, ey)], BLUE)
d.arrow([(M.cx, M.b), (M.cx, ey - 30), (eb[2].cx - 40, ey - 30), (eb[2].cx - 40, ey)], CYAN)
d.arrow([(A.cx, A.b), (A.cx, ey)], PURPLE, dash='4 3')
d.arrow([(I.cx, I.b), (I.cx, ey)], PINK, dash='4 3')
d.text(A.cx + 8, ey - 20, 'knowledge.json', 10, PURPLE, anchor='start', mono=True)
d.text(I.cx - 8, ey - 20, 'SecretVault', 10, PINK, anchor='end', mono=True)

d.legend(40, H - 40, [(SIGNAL, 'Host / reception'), (BLUE, 'UI / providers'), (AMBER, 'Gates / skills'), (PURPLE, 'State / agents'), (CYAN, 'Tools')])
d.save('docs/diagrams')
