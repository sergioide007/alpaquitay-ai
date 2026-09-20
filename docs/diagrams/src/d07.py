from dlib import *
W, H = 1120, 890
d = D(W, H, 'Development view · 4+1', 'Hexagonal domain shell: ports and adapters',
      'The domain never imports infrastructure. Swap the AI provider or storage without touching a line of application code.', '07-hexagonal-domain-shell')
caller = d.card(40, 250, 150, 'Caller', 'CentralBrainAgent · Orchestrator · Hub', GRAY, h=90)
d.group(230, 130, 520, 560, 'Application core', SIGNAL, 'no framework imports', fo=.03)
pin = d.card(250, 180, 480, 'Primary ports  ·  ports/input.ts', 'Typed interfaces the caller invokes (driving side). The shell never leaks implementation details outward.', BLUE, h=76)
uc = d.card(250, 276, 480, 'Use cases  ·  application/', 'Orchestrate the domain and the ports: PracticeGrammar · AssessLevel · GetDailyPhrases · SubmitExercise …', SIGNAL, h=76)
dm = d.card(250, 372, 480, 'Domain  ·  domain/model.ts', 'Entities, value objects, aggregate roots: CEFRLevel, Exercise, Lesson, DailyPhrase. Zero imports.', PURPLE, h=76)
gr = d.card(250, 468, 480, 'Guardrails  ·  checkGuardrails()', 'Run before any output is committed: block | warn | pass (e.g. “a lesson needs at least one exercise”).', AMBER, h=76)
pout = d.card(250, 564, 480, 'Secondary ports  ·  ports/output.ts', 'Typed interfaces that infrastructure must implement (driven side). The domain depends on these, never on adapters.', BLUE, h=76)
for a, b in [(pin, uc), (uc, dm), (dm, gr)]: d.arrow([a.bot(), b.top()], MUTED, sw=1.3)
d.arrow([gr.bot(), pout.top()], MUTED, sw=1.3)
d.arrow([caller.right(), (230, caller.cy), (250, pin.cy + 0) ], BLUE) if False else None
d.arrow([caller.right(), (215, caller.cy), (215, pin.cy), (250, pin.cy)], BLUE, label='invoke')
# adapters
ad = d.group(790, 130, 290, 560, 'Infrastructure', BLUE, 'adapters', fo=.03)
a1 = d.card(806, 190, 258, 'AIProviderAdapter', 'Implements the AI port on top of AIProviderManager (Anthropic · OpenAI · Ollama · LM Studio).', BLUE, h=104)
a2 = d.card(806, 320, 258, 'LessonStorageAdapter', 'Persists learner state under .alpaquitay/ so shells keep memory across sessions.', CYAN, h=96)
a3 = d.card(806, 442, 258, 'Your adapter', 'Any new API, ERP, CRM or database: implement the port, register it — nothing else changes.', PINK, h=96, dash='4 3')
for a in (a1, a2, a3):
    d.arrow([(a.x, a.cy), (770, a.cy)], BLUE, sw=1.3, head=False, dash='4 3')
d.arrow([(770, a1.cy), (770, pout.cy), (730, pout.cy)], BLUE, dash='4 3', label='implements', lpos=.5, lcolor=BLUE)
# base + tree
d.card(40, 730, 500, 'BaseDomainShell — Template Method', 'ask() · parseJSON() · checkGuardrails() · saveMemory() / loadMemory(). Every one of the 17 shells extends it and implements IDomainAgentShell.', SIGNAL, h=84)
d.rect(570, 730, 510, 84, PANEL, BORDER, 1, 10)
tree = ['src/domains/{vertical}/', '\u00a0\u00a0domain/  ports/{input,output}.ts  application/', '\u00a0\u00a0infrastructure/  {Vertical}DomainShell.ts']
for i, t in enumerate(tree): d.text(588, 756 + i * 20, t, 11.5, MUTED if i else TEXT, False, mono=True)
d.text(40, 712, 'Dependency rule: infrastructure → ports ← application → domain      (arrows only ever point inward)', 11.5, SIGNAL, False, mono=True)
d.legend(40, H - 40, [(BLUE, 'Ports / adapters'), (SIGNAL, 'Application'), (PURPLE, 'Domain'), (AMBER, 'Guardrails')])
d.save('docs/diagrams')
