from dlib import *

W, H = 1120, 736
d = D(W, H, 'Process design · SDLC', 'Six SDLC phases, each with an executable gate',
      'A phase is detected from the request; it only advances when its gate passes. No gate, no progress.', '04-sdlc-gates')

phases = [
    ('Requirements', 'requisitos', 'FLASH', AMBER, 'quiero · necesito · alcance · historia · épica', 'objective + scope + out-of-scope + owner', 'ideate → idea inbox'),
    ('Design', 'diseño', 'DEEP', PURPLE, 'arquitectura · ADR · diagrama · esquema', 'ADR recorded + no circular dependencies', 'specialist → architect shell'),
    ('Implementation', 'implementación', 'BUILD', SIGNAL, 'crea · implementa · fix · endpoint · bug', 'SOLID + preview + checkpoint + build/test', 'code → diff-first'),
    ('Testing', 'pruebas', 'BUILD', SIGNAL, 'test · coverage · QA · e2e · validar', 'happy path + edge + error, coverage not lowered', 'code → generate tests'),
    ('Deployment', 'despliegue', 'DEEP', PURPLE, 'deploy · pipeline · docker · rollback · IaC', 'green pipeline + human approval + rollback ready', 'specialist → DevOps shell'),
    ('Maintenance', 'mantenimiento', 'DEEP', PURPLE, 'monitoreo · deuda · incidente · postmortem', 'runbook + alert + service owner', 'specialist → ops shells'),
]
n = len(phases)
gap = 10
pw = (1040 - gap * (n - 1)) / n     # ~165
y0 = 132

# chevron rail
for i, (name, es, lane, col, kw, gate, route) in enumerate(phases):
    x = 40 + i * (pw + gap)
    pts = f'{x},{y0} {x + pw - 14},{y0} {x + pw},{y0 + 26} {x + pw - 14},{y0 + 52} {x},{y0 + 52} {x + 14},{y0 + 26}' if i else \
          f'{x},{y0} {x + pw - 14},{y0} {x + pw},{y0 + 26} {x + pw - 14},{y0 + 52} {x},{y0 + 52}'
    d.add(f'<polygon points="{pts}" fill="{col}" fill-opacity=".16" stroke="{col}" stroke-opacity=".8" stroke-width="1.4" stroke-linejoin="round"/>')
    d.text(x + pw / 2 + (4 if i else 0), y0 + 22, f'{i + 1} · {name}', 12, TEXT, True, 'middle', maxw=pw - 26)
    d.text(x + pw / 2 + (4 if i else 0), y0 + 39, es, 10.5, MUTED, False, 'middle', True)

# rows: label column is implicit; draw three stacked "lanes" of cells under the rail
row_defs = [('DETECTED BY KEYWORDS', 'kw', 66), ('ROUTE', 'route', 78), ('EXIT GATE', 'gate', 96)]
ry = y0 + 52 + 34
for label, key, rh in row_defs:
    d.text(40, ry - 10, label, 10.5, DIM, True, mono=True, ls=1.4)
    for i, ph in enumerate(phases):
        name, es, lane, col, kw, gate, route = ph
        x = 40 + i * (pw + gap)
        val = {'kw': kw, 'route': route, 'gate': gate}[key]
        if key == 'gate':
            d.rect(x, ry, pw, rh, col, col, 1.3, 9, None, .10, .7)
            d.badge(x + 18, ry + 20, '✓', col, 10)
            d.para(x + 12, ry + 44, val, 11.5, TEXT, maxw=pw - 24, lh=16)
        elif key == 'route':
            d.rect(x, ry, pw, rh, col, col, 1, 9, None, .05, .4)
            d.pill(x + 10, ry + 10, lane, col, 10.5, True, 8, 20, .18)
            d.para(x + 12, ry + 52, val, 11, MUTED, maxw=pw - 24, lh=15)
        else:
            d.rect(x, ry, pw, rh, BORDER, BORDER, 1, 9, None, .0, .8)
            d.para(x + 12, ry + 24, val, 11, MUTED, maxw=pw - 24, lh=16, mono=False)
    ry += rh + 36

# progression rule + fallback
d.rect(40, ry - 6, 1040, 78, PANEL, BORDER, 1, 10)
d.badge(66, ry + 20, '!', RED, 10)
d.text(88, ry + 18, 'Gate fails → the phase does not advance', 13, TEXT, True)
d.para(88, ry + 38, 'The harness explains what is missing (for example: “diffs pending — si aplicar or no first”) and adds to the agentic debt. When debt reaches 100, Build is blocked until it is paid down with onboard, applied changes or verified Done.', 11.5, MUTED, maxw=960, lh=16)
ry += 96
d.text(40, ry + 6, 'No phase detected?  →  Flash · clarify before touching disk', 11.5, MUTED)
d.legend(40, H - 40, [(AMBER, 'Flash · local, free'), (SIGNAL, 'Build · SDD, diff-first'), (PURPLE, 'Deep · specialist')])
d.save('docs/diagrams')
