"""Tiny SVG diagram toolkit for Alpaquitay AI docs (consistent brand, measured text)."""
from PIL import ImageFont
from xml.sax.saxutils import escape
import cairosvg, re, os

FD = '/usr/share/fonts/truetype/dejavu/'
_F = {}
def _font(size, bold=False, mono=False):
    key = (round(size * 4), bold, mono)
    if key not in _F:
        name = 'DejaVuSansMono-Bold.ttf' if (mono and bold) else 'DejaVuSansMono.ttf' if mono else \
               'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf'
        _F[key] = ImageFont.truetype(FD + name, size * 4)   # measure at 4x for precision
    return _F[key]

def tw(s, size, bold=False, mono=False):
    return _font(size, bold, mono).getlength(s) / 4.0

def wrap(s, size, maxw, bold=False, mono=False):
    out = []
    for para in s.split('\n'):
        words, cur = para.split(' '), ''
        for w in words:
            t = (cur + ' ' + w).strip()
            if tw(t, size, bold, mono) <= maxw or not cur:
                cur = t
            else:
                out.append(cur); cur = w
        out.append(cur)
    return out

# ── Brand palette (matches the Hub webview: --signal, --blue, --warn, --accent) ──
BG, PANEL, BORDER = '#0d1117', '#161b22', '#30363d'
TEXT, MUTED, DIM = '#e6edf3', '#9ca3af', '#6b7280'
SIGNAL, BLUE, AMBER, RED = '#00e5a0', '#3b82f6', '#f59e0b', '#ff4b6e'
PURPLE, CYAN, PINK, GRAY = '#a78bfa', '#22d3ee', '#f472b6', '#8b949e'

SANS = "'IBM Plex Sans','Segoe UI',-apple-system,BlinkMacSystemFont,'Helvetica Neue',Arial,sans-serif"
MONO = "'IBM Plex Mono',ui-monospace,SFMono-Regular,Consolas,Menlo,monospace"

class Box:
    def __init__(s, x, y, w, h): s.x, s.y, s.w, s.h = x, y, w, h
    @property
    def cx(s): return s.x + s.w / 2
    @property
    def cy(s): return s.y + s.h / 2
    @property
    def r(s): return s.x + s.w
    @property
    def b(s): return s.y + s.h
    def top(s, dx=0): return (s.cx + dx, s.y)
    def bot(s, dx=0): return (s.cx + dx, s.b)
    def left(s, dy=0): return (s.x, s.cy + dy)
    def right(s, dy=0): return (s.r, s.cy + dy)

class D:
    def __init__(s, w, h, kicker, title, subtitle, name):
        s.w, s.h, s.name = w, h, name
        s.p = []          # svg body parts
        s.title, s.subtitle = title, subtitle
        s.overflow = []
        s._header(kicker, title, subtitle)

    # ── primitives ────────────────────────────────────────────────────────────
    def add(s, x): s.p.append(x)

    def rect(s, x, y, w, h, fill='none', stroke='none', sw=1, rx=8, dash=None, fo=1, so=1):
        d = f' stroke-dasharray="{dash}"' if dash else ''
        s.add(f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="{h:.1f}" rx="{rx}" fill="{fill}" fill-opacity="{fo}" '
              f'stroke="{stroke}" stroke-opacity="{so}" stroke-width="{sw}"{d}/>')

    def text(s, x, y, t, size=12, fill=TEXT, bold=False, anchor='start', mono=False, op=1, ls=None, maxw=None):
        w = tw(t, size, bold, mono)
        if maxw and w > maxw + 0.5:
            s.overflow.append((t, round(w), maxw))
        fam = MONO if mono else SANS
        lsp = f' letter-spacing="{ls}"' if ls else ''
        s.add(f'<text x="{x:.1f}" y="{y:.1f}" font-family="{fam}" font-size="{size}" '
              f'font-weight="{700 if bold else 400}" fill="{fill}" fill-opacity="{op}" text-anchor="{anchor}"{lsp}>{escape(t)}</text>')

    def para(s, x, y, t, size=11.5, fill=MUTED, lh=None, maxw=200, mono=False, bold=False, anchor='start'):
        lh = lh or size * 1.45
        lines = wrap(t, size, maxw, bold, mono)
        for i, ln in enumerate(lines):
            s.text(x, y + i * lh, ln, size, fill, bold, anchor, mono, maxw=maxw)
        return len(lines) * lh

    def _header(s, kicker, title, subtitle):
        s.rect(0, 0, s.w, s.h, BG, BORDER, 1, 14)
        s.rect(0, 0, s.w, 4, SIGNAL, rx=0)
        s.text(40, 40, kicker.upper(), 11, SIGNAL, True, mono=True, ls=1.6)
        s.text(40, 70, title, 24, TEXT, True, maxw=s.w - 80)
        s.text(40, 94, subtitle, 13, MUTED, maxw=s.w - 80)

    # ── composites ────────────────────────────────────────────────────────────
    def card(s, x, y, w, title, body=None, color=SIGNAL, h=None, body_mono=False, tsize=13, bsize=11.5,
             tag=None, pad=12, fo=.07, dash=None, title_color=TEXT):
        inner = w - pad * 2 - 4
        tl = wrap(title, tsize, inner - (26 if tag else 0), True)
        bl = wrap(body, bsize, inner, mono=body_mono) if body else []
        th = len(tl) * tsize * 1.3
        bh = len(bl) * bsize * 1.42
        auto = pad + th + (6 if bl else 0) + bh + pad - 2
        H = max(h or 0, auto)
        s.rect(x, y, w, H, color, color, 1.2, 8, dash, fo, .55)
        s.rect(x, y + 6, 3, H - 12, color, rx=1.5)
        yy = y + pad + tsize * .95
        for i, ln in enumerate(tl):
            s.text(x + pad + 4, yy + i * tsize * 1.3, ln, tsize, title_color, True)
        yy = y + pad + th + 6 + bsize * .92
        for i, ln in enumerate(bl):
            s.text(x + pad + 4, yy + i * bsize * 1.42, ln, bsize, MUTED, False, mono=body_mono, maxw=inner)
        if tag:
            s.badge(x + w - 18, y + 18, tag, color)
        return Box(x, y, w, H)

    def row(s, x, y, w, title, body, color, tcol=118, h=None, bsize=11, tag=None):
        """Compact 'step' row: bold title on the left, description on the right."""
        bl = wrap(body, bsize, w - tcol - 22 - (22 if tag else 0))
        tl = wrap(title, 12.5, tcol - 20, True)
        H = max(h or 0, 12 + max(len(bl) * bsize * 1.4, len(tl) * 16), 34)
        s.rect(x, y, w, H, color, color, 1.1, 7, None, .07, .5)
        s.rect(x, y + 5, 3, H - 10, color, rx=1.5)
        ty = y + H / 2 - (len(tl) - 1) * 8 + 4.5
        for i, ln in enumerate(tl):
            s.text(x + 14, ty + i * 16, ln, 12.5, TEXT, True)
        by = y + H / 2 - (len(bl) - 1) * bsize * .7 + bsize * .36
        for i, ln in enumerate(bl):
            s.text(x + tcol, by + i * bsize * 1.4, ln, bsize, MUTED)
        if tag:
            s.badge(x + w - 16, y + H / 2, tag, color)
        return Box(x, y, w, H)

    def group(s, x, y, w, h, label, color=GRAY, sub=None, dash='5 4', fo=.03):
        s.rect(x, y, w, h, color, color, 1.2, 12, dash, fo, .45)
        lw = tw(label.upper(), 10.5, True, True) + 20
        s.rect(x + 14, y - 10, lw, 20, BG, color, 1.1, 10, None, 1, .7)
        s.text(x + 24, y + 4, label.upper(), 10.5, color, True, mono=True, ls=.3)
        if sub:
            sw_ = tw(sub, 11)
            s.rect(x + 14 + lw + 4, y - 8, sw_ + 12, 16, BG, rx=4)
            s.text(x + 14 + lw + 10, y + 4, sub, 11, MUTED, maxw=w - lw - 40)

    def badge(s, cx, cy, letter, color, r=9):
        s.add(f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{BG}" stroke="{color}" stroke-width="1.4"/>')
        s.text(cx, cy + 4, letter, 11, color, True, 'middle', True)

    def pill(s, x, y, t, color=GRAY, size=11, mono=True, pad=10, h=22, fo=.10):
        w = tw(t, size, False, mono) + pad * 2
        s.rect(x, y, w, h, BG, rx=h / 2)
        s.rect(x, y, w, h, color, color, 1, h / 2, None, fo, .55)
        s.text(x + pad, y + h / 2 + size * .36, t, size, TEXT, False, mono=mono)
        return Box(x, y, w, h)

    def arrow(s, pts, color=MUTED, dash=None, label=None, lpos=0.5, head=True, sw=1.6, lside='mid', lcolor=None):
        d = 'M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts)
        da = f' stroke-dasharray="{dash}"' if dash else ''
        m = f' marker-end="url(#ah-{color[1:]})"' if head else ''
        s.add(f'<path d="{d}" fill="none" stroke="{color}" stroke-width="{sw}" stroke-linejoin="round"{da}{m}/>')
        if label:
            # place at the midpoint of the longest segment (or lpos along first segment)
            segs = [(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
            a, b = max(segs, key=lambda sg: abs(sg[0][0] - sg[1][0]) + abs(sg[0][1] - sg[1][1]))
            mx, my = a[0] + (b[0] - a[0]) * lpos, a[1] + (b[1] - a[1]) * lpos
            lw = tw(label, 10.5, False, False) + 12
            s.rect(mx - lw / 2, my - 9, lw, 18, BG, BORDER, 1, 9, None, 1, 1)
            s.text(mx, my + 4, label, 10.5, lcolor or MUTED, False, 'middle')

    def legend(s, x, y, items):
        cx = x
        for color, label in items:
            s.rect(cx, y - 9, 12, 12, color, color, 1, 3, None, .25, .9)
            s.text(cx + 18, y + 1, label, 11, MUTED)
            cx += 18 + tw(label, 11) + 26

    # ── output ────────────────────────────────────────────────────────────────
    def svg(s, png=False):
        cols = sorted(set(re.findall(r'ah-([0-9a-fA-F]{6})', ''.join(s.p))))
        defs = ''.join(
            f'<marker id="ah-{c}" viewBox="0 0 10 10" refX="8.6" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">'
            f'<path d="M1,1 L9,5 L1,9 z" fill="#{c}"/></marker>' for c in cols)
        body = ''.join(s.p)
        foot = (f'<text x="{s.w - 40}" y="{s.h - 16}" font-family="{SANS}" font-size="10.5" fill="{DIM}" text-anchor="end">'
                f'Alpaquitay AI · github.com/sergioide007/alpaquitay-ai</text>')
        out = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {s.w} {s.h}" width="{s.w}" height="{s.h}" role="img" '
               f'aria-labelledby="t d"><title id="t">{escape(s.title)}</title><desc id="d">{escape(s.subtitle)}</desc>'
               f'<defs>{defs}</defs>{body}{foot}</svg>')
        if png:
            out = out.replace(SANS, "'DejaVu Sans'").replace(MONO, "'DejaVu Sans Mono'")
        return out

    def save(s, outdir):
        os.makedirs(outdir + '/svg', exist_ok=True); os.makedirs(outdir, exist_ok=True)
        open(f'{outdir}/svg/{s.name}.svg', 'w').write(s.svg())
        cairosvg.svg2png(bytestring=s.svg(png=True).encode(), write_to=f'{outdir}/{s.name}.png', scale=2)
        if s.overflow:
            print(f'!! {s.name}: text overflow ->', s.overflow[:8])
        else:
            print(f'ok {s.name}')
