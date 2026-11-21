from dlib import *
W, H = 1120, 962
d = D(W, H, 'Domain agents', 'Multi-agent orchestration: CentralBrain → Orchestrator → 17 domain shells',
      'A strategic objective is sanitized, enriched, decomposed, assigned to specialists, refined, and the best answers are learned.', '06-domain-orchestration')
# pipeline
steps = [('1 · PrivacyGuard', 'sanitize(): 9 PII detectors mapped to GDPR articles; medium/high risk is never stored.', SIGNAL),
         ('2 · RAGEngine', 'augment(): BM25-lite over 10 standards chunks (ISO 42010, TOGAF, DORA…) in knowledge.json.', BLUE),
         ('3 · Orchestrator', 'execute(): decompose, assign to the best-scoring shell, run in batches by dependsOn.', PURPLE),
         ('4 · Refinement', 'refine(): rubric score, threshold 75, at most 3 recursive iterations.', AMBER),
         ('5 · Learn', 'learn(): outputs scoring ≥ 80 and safe to store go back to the knowledge base.', SIGNAL)]
obj = d.card(40, 120, 1040, 'Objective', 'e.g. “Review code quality, assess our cloud costs and define OKRs for Q3” → CentralBrainAgent.process()', GRAY, h=56)
d.group(40, 206, 1040, 156, 'CentralBrainAgent', SIGNAL, 'hierarchical multi-agent system · strategic level', fo=.03)
cw = (1040 - 32 - 4 * 14) / 5; bx = []
for i, (t, b, col) in enumerate(steps):
    c = d.card(56 + i * (cw + 14), 232, cw, t, b, col, h=116, bsize=11); bx.append(c)
    if i: d.arrow([(c.x - 14, c.cy), (c.x, c.cy)], MUTED, sw=1.3)
d.arrow([obj.bot(), (obj.cx, 206)], MUTED)
# orchestrator detail
oy = 396
d.group(40, oy, 1040, 150, 'OrchestratorAgent', PURPLE, 'tactical level · MetaheuristicEngine picks the algorithm by problem size', fo=.03)
algos = [('n ≤ 3 tasks', 'Greedy', 'best keyword match per task, zero overhead', SIGNAL),
         ('n ≤ 10 tasks', 'Genetic algorithm', 'population 20 · 50 generations · tournament selection · elitism', AMBER),
         ('n > 10 tasks', 'Simulated annealing', 'T₀ = 1.0 · α = 0.95 · 200 iterations, escapes local optima', PINK)]
aw = (1040 - 32 - 2 * 14) / 3
for i, (n, t, b, col) in enumerate(algos):
    d.card(56 + i * (aw + 14), oy + 28, aw, f'{t}  ·  {n}', b, col, h=64, bsize=11)
d.text(58, oy + 122, 'Then: parallel batches that respect the dependency graph (dependsOn + canParallelize) → aggregate the results.', 11.5, MUTED)
d.arrow([(bx[2].cx, bx[2].b + 0), (bx[2].cx, oy)], PURPLE, dash='4 3')
# registry
ry = 580
d.group(40, ry, 1040, 300, 'AgentRegistry', BLUE, 'lazy factory + semantic scoring · every shell implements IDomainAgentShell', fo=.03)
groups = [('Engineering', BLUE, ['software-engineer', 'software-architect', 'developer', 'qa', 'devops', 'devsecops']),
          ('Security & cloud', RED, ['security', 'zero-trust', 'quantum-readiness', 'infrastructure', 'cloud', 'well-architected']),
          ('Business & AI', PURPLE, ['business', 'marketing', 'process', 'ai-expert']),
          ('Learning', SIGNAL, ['english'])]
gx = 56; gw = [300, 300, 222, 140]
for (name, col, items), w in zip(groups, gw):
    d.rect(gx, ry + 28, w, 170, col, col, 1.1, 9, None, .05, .5)
    d.text(gx + 12, ry + 48, name.upper(), 10.5, col, True, mono=True, ls=.5)
    yy = ry + 60
    for k, it in enumerate(items):
        cols_ = 2 if w > 250 else 1
        cx_ = gx + 10 + (k % cols_) * ((w - 20) / cols_); cy_ = yy + (k // cols_) * 34
        pw = (w - 20) / cols_ - 6
        d.rect(cx_, cy_, pw, 28, col, col, 1, 6, None, .12, .6)
        d.text(cx_ + pw / 2, cy_ + 18, it, 10.5, TEXT, False, 'middle', True, maxw=pw - 6)
    gx += w + 14
d.text(56, ry + 218, 'PLANNED', 10.5, DIM, True, mono=True, ls=1.2)
px = 56
for it in ['finance', 'legal', 'logistics', 'recruiting', 'healthcare', 'education']:
    b = d.pill(px, ry + 228, it, GRAY, 10.5, True, 9, 22, .03); px = b.r + 8
d.text(56, ry + 274, 'Each shell: use cases → checkGuardrails() → block · warn · pass  (e.g. EU AI Act tier, LTV:CAC < 3, runway < 6 months, ADR traceability).', 11.5, MUTED)
d.arrow([(540, oy + 150), (540, ry)], PURPLE)
d.legend(40, H - 40, [(SIGNAL, 'Privacy / learning'), (BLUE, 'Retrieval / registry'), (PURPLE, 'Orchestration'), (AMBER, 'Quality loop')])
d.save('docs/diagrams')
