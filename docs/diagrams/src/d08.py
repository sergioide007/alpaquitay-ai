from dlib import *
W, H = 1120, 820
d = D(W, H, 'Process design · Arch tab', 'Architecture inference: from evidence to diagram to infrastructure code',
      'The canvas draws the system itself, not just epic titles. Manual edits always win; Re-infer rebuilds from current evidence.', '08-arch-inference')
src = [('Workspace manifests', 'package.json (root + monorepo), requirements.txt, pyproject, pom.xml, build.gradle, go.mod, composer, Gemfile, *.csproj, serverless.yml → real stack', BLUE),
       ('Docker Compose', 'docker-compose.yml / compose.yaml services (registry- and tag-aware): PostgreSQL, Redis, Kafka, RabbitMQ, reverse proxy, Keycloak, MinIO…', CYAN),
       ('spec.md text', 'Epic titles, tasks and body; Spanish and English keywords, accent-normalized → the system the project will build', SIGNAL)]
sw = (1040 - 2 * 16) / 3; boxes = []
for i, (t, b, col) in enumerate(src):
    boxes.append(d.card(40 + i * (sw + 16), 122, sw, t, b, col, h=118, bsize=11))
inf = d.card(40, 290, 1040, 'SystemArchitecture (pure, unit-tested)', 'systemNodesFromEvidence · composeServiceNodes · systemNodesFromSpecText → mergeSystemNodes: concrete detections beat generic ones, no duplicates, capped at 14 system nodes (+ up to 8 epic modules only for component types not already covered).', PURPLE, h=84)
for b in boxes: d.arrow([b.bot(), (b.cx, inf.y)], MUTED)
wire = d.card(40, 412, 1040, 'Auto-wiring', 'client → main API / service (HTTP or via reverse proxy)   ·   main → auth · database · cache · queue   ·   epic modules → main entry point', AMBER, h=64)
d.arrow([inf.bot(), wire.top()], MUTED)
st = d.card(40, 508, 500, 'S.arch = { nodes, edges }', 'The editable canvas. Drag, rename, connect, add from the palette. Toast summary: “System: React SPA · Node/Express API · PostgreSQL …”', SIGNAL, h=92)
c4 = d.card(580, 508, 500, 'C4 levels', 'Context · Container · Component tabs over the same model.', BLUE, h=92)
d.arrow([(st.cx, wire.b), (st.cx, st.y)], MUTED); d.arrow([(c4.cx, wire.b), (c4.cx, c4.y)], MUTED)
sv = d.card(40, 640, 320, 'Persist', 'arch-save / arch-load ⇄ .alpaquitay/arch.json. “↻ Re-infer” regenerates.', CYAN, h=76)
d.arrow([(sv.cx, st.b), (sv.cx, sv.y)], MUTED)
d.text(400, 664, 'arch-export → infra/main.*', 12, TEXT, True)
fm = [('Terraform', '.tf · AWS', AMBER), ('AWS CDK', '.ts', AMBER), ('Azure Bicep', '.bicep', BLUE), ('GCP', '.yaml', RED)]
fx = 400
for n, e, col in fm:
    b = d.pill(fx, 676, f'{n}  {e}', col, 11, False, 10, 28, .14); fx = b.r + 8
d.arrow([st.bot(dx=180), (600, 640), ], MUTED, head=False) if False else None
d.arrow([(st.r - 40, st.b), (st.r - 40, 626), (560, 626), (560, 660)], MUTED)
d.text(400, 730, 'Export is a starting point to review, not a deployment: resources for unknown node types are left as comments.', 11.5, MUTED)
d.legend(40, H - 40, [(BLUE, 'Manifests'), (CYAN, 'Compose / persistence'), (SIGNAL, 'Spec / canvas'), (PURPLE, 'Inference'), (AMBER, 'Wiring / IaC')])
d.save('docs/diagrams')
