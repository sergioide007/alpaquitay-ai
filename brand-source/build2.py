import os, io, base64, cairosvg
from PIL import Image, ImageDraw, ImageFilter
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
OUT='/tmp/b2/out'; os.makedirs(OUT,exist_ok=True)
M=Image.open('/tmp/b2/master_1200.png').convert('RGBA')
NAVY_TOP=(2,26,94); NAVY_BOT=(0,7,40); CYAN="#00DAFE"; GOLD1="#FFD98A"; GOLD2="#F2A03D"; CREAM="#F4F1EA"; INKN="#06133F"; MUTED="#A9B8E0"

def rs(im,s,sharp=True):
    r=im.resize((s,s),Image.LANCZOS)
    if sharp and s<=256: r=r.filter(ImageFilter.UnsharpMask(radius=0.6,percent=60,threshold=2))
    return r
def rmask(size,rad):
    m=Image.new('L',(size*4,size*4),0); ImageDraw.Draw(m).rounded_rectangle((0,0,size*4-1,size*4-1),rad*4,fill=255)
    return m.resize((size,size),Image.LANCZOS)
def b64(im):
    b=io.BytesIO(); im.save(b,'PNG',optimize=True); return base64.b64encode(b.getvalue()).decode()
def gradbg(s):
    g=Image.new('RGB',(1,s)); 
    for y in range(s):
        t=y/(s-1); g.putpixel((0,y),tuple(int(NAVY_TOP[i]*(1-t)+NAVY_BOT[i]*t) for i in range(3)))
    return g.resize((s,s)).convert('RGBA')

# ---- face crop (small sizes) ----
def face(size):
    box=(165,28,1045,908)            # 880 square: ears, head, goggles, muzzle
    c=M.crop(box).convert('RGBA'); c=c.resize((size,size),Image.LANCZOS)
    if size<=256: c=c.filter(ImageFilter.UnsharpMask(radius=0.5,percent=70,threshold=2))
    c.putalpha(rmask(size,int(size*.24))); return c
# ---- outputs ----
icon512=rs(M,512); icon512.save(f'{OUT}/icon.png',optimize=True)
rs(M,1024,False).save(f'{OUT}/icon-1024.png',optimize=True)
rs(M,192).save(f'{OUT}/android-chrome-192x192.png',optimize=True); icon512.save(f'{OUT}/android-chrome-512x512.png',optimize=True)
for s in (16,32,48,96): face(s).save(f'{OUT}/favicon-{s}x{s}.png',optimize=True)
# apple touch: full-bleed navy + framed tile
ap=gradbg(180); t=rs(M,170); ap.alpha_composite(t,(5,5)); ap.convert('RGB').save(f'{OUT}/apple-touch-icon.png',optimize=True)
# maskable 512: face crop inside the 80% safe circle
mk=gradbg(512); f=face(512).resize((372,372),Image.LANCZOS); 
fm=M.crop((165,28,1045,908)).convert('RGB').resize((372,372),Image.LANCZOS)
fmask=Image.new('L',(372,372),0); ImageDraw.Draw(fmask).rectangle((34,34,337,337),fill=255); fmask=fmask.filter(ImageFilter.GaussianBlur(22))
mk.paste(fm,(70,80),fmask); mk.convert('RGB').save(f'{OUT}/maskable-512x512.png',optimize=True)
# ico
ims=[Image.open(f'{OUT}/favicon-{s}x{s}.png').convert('RGBA') for s in (48,32,16)]
ims[0].save(f'{OUT}/favicon.ico',format='ICO',sizes=[(48,48),(32,32),(16,16)],append_images=ims[1:])

# ---- svg wrappers (embedded raster) ----
mark_b=b64(rs(M,256)); fav_b=b64(face(128)); lock_b=b64(rs(M,176))
open(f'{OUT}/alpaquitay-mark.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512" role="img"><title>Alpaquitay AI</title><image width="512" height="512" href="data:image/png;base64,{mark_b}"/></svg>')
open(f'{OUT}/favicon.svg','w').write(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 128 128"><image width="128" height="128" href="data:image/png;base64,{fav_b}"/></svg>')

# ---- text helpers ----
_f={}
def font(n):
    if n not in _f: _f[n]=TTFont(f"/usr/share/fonts/opentype/inter/{n}.otf")
    return _f[n]
def text_path(txt,name,size,x=0,y=0,tr=0.0):
    f=font(name); gs=f.getGlyphSet(); cm=f.getBestCmap(); upm=f['head'].unitsPerEm; sc=size/upm; cx=0; d=[]
    for ch in txt:
        g=cm[ord(ch)]; p=SVGPathPen(gs); gs[g].draw(TransformPen(p,(sc,0,0,-sc,x+cx*sc,y))); d.append(p.getCommands()); cx+=f['hmtx'][g][0]+tr*upm
    return " ".join(d), cx*sc
def tw(txt,name,size,tr=0.0): return text_path(txt,name,size,0,0,tr)[1]
GOLDDEF=f'<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{GOLD1}"/><stop offset="1" stop-color="{GOLD2}"/></linearGradient>'

# ---- logo lockups ----
def lockup(dark):
    col=CREAM if dark else INKN; x0=160; ty=92
    d1,w1=text_path("Alpaquitay","InterDisplay-Bold",60,x0,ty,-0.025)
    d2,w2=text_path("AI","InterDisplay-Bold",30,x0+w1+14,ty-1,0.12)
    W=int(x0+w1+14+w2+12)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 {W} 144" role="img"><title>Alpaquitay AI</title><defs>{GOLDDEF}</defs>'
            f'<image x="8" y="8" width="128" height="128" href="data:image/png;base64,{lock_b}"/>'
            f'<path fill="{col}" d="{d1}"/><path fill="url(#gold)" d="{d2}"/></svg>'), W
l1,W=lockup(True); l2,_=lockup(False)
open(f'{OUT}/alpaquitay-logo.svg','w').write(l1); open(f'{OUT}/alpaquitay-logo-light.svg','w').write(l2)

# ---- social 1200x630 ----
yc=470
def chip(x,label,on=False):
    t=tw(label,"InterDisplay-SemiBold",19,0.06); d,_=text_path(label,"InterDisplay-SemiBold",19,x+(184-t)/2,yc+31,0.06)
    if on: return f'<rect x="{x}" y="{yc}" width="184" height="48" rx="24" fill="url(#gold)"/><path fill="#05122E" d="{d}"/>'
    return f'<rect x="{x}" y="{yc}" width="184" height="48" rx="24" fill="#061A4A" stroke="#1B6FD6"/><path fill="#E6F4FF" d="{d}"/>'
def arrow(x): return f'<path d="M{x} {yc+24}h34" stroke="{CYAN}" stroke-width="2"/><path d="m{x+27} {yc+17} 8 7-8 7" fill="none" stroke="{CYAN}" stroke-width="2"/>'
t1,_=text_path("Alpaquitay","InterDisplay-Bold",84,80,200,-0.025); w1=tw("Alpaquitay","InterDisplay-Bold",84,-0.025)
t2,_=text_path("AI","InterDisplay-Bold",38,80+w1+20,199,0.12)
h1,_=text_path("AI software development","InterDisplay-SemiBold",46,80,300,-0.015)
h2,_=text_path("with proof built in.","InterDisplay-SemiBold",46,80,356,-0.015)
sub,_=text_path("Spec-driven · Reviewable diffs · Verified before done","Inter-Medium",23,82,405)
foot,_=text_path("For VS Code  ·  Privacy-first  ·  Open source","Inter-Medium",20,82,590)
tile_b=b64(rs(M,760,False))
chips=chip(80,"SPEC")+arrow(268)+chip(312,"BUILD")+arrow(500)+chip(544,"REVIEW")+arrow(732)+chip(776,"VERIFY",True)
soc=(f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 1200 630" role="img"><title>Alpaquitay AI: AI software development with proof built in</title>'
 f'<defs>{GOLDDEF}<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#020A26"/><stop offset="1" stop-color="#010514"/></linearGradient>'
 f'<radialGradient id="gl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#0A5BFF" stop-opacity=".42"/><stop offset="1" stop-color="#0A5BFF" stop-opacity="0"/></radialGradient></defs>'
 f'<rect width="1200" height="630" fill="url(#bg)"/><circle cx="985" cy="215" r="330" fill="url(#gl)"/>'
 f'<image x="795" y="30" width="380" height="380" href="data:image/png;base64,{tile_b}"/>'
 f'<path fill="{CREAM}" d="{t1}"/><path fill="url(#gold)" d="{t2}"/><path fill="{CREAM}" d="{h1}"/><path fill="{CREAM}" d="{h2}"/><path fill="{MUTED}" d="{sub}"/>'
 f'{chips}<path fill="#7F8FBF" d="{foot}"/></svg>')
cairosvg.svg2png(bytestring=soc.encode(),write_to=f'{OUT}/alpaquitay-social.png',output_width=1200,output_height=630)

# ---- preview sheet ----
sh=Image.new('RGB',(1300,520),(236,238,244))
sh.paste(icon512.resize((300,300)),(20,20),icon512.resize((300,300)))
x=350
for s in (96,48,32,16):
    t=Image.open(f'{OUT}/favicon-{s}x{s}.png'); sh.paste(t,(x,20),t); x+=s+24
big=Image.open(f'{OUT}/favicon-16x16.png').resize((128,128),Image.NEAREST); sh.paste(big,(350,150),big)
mkim=Image.open(f'{OUT}/maskable-512x512.png').convert('RGBA').resize((200,200)); mm=Image.new('L',(200,200),0); ImageDraw.Draw(mm).ellipse((0,0,199,199),fill=255); sh.paste(mkim,(520,150),mm)
a=Image.open(f'{OUT}/apple-touch-icon.png'); sh.paste(a,(740,150))
soc_im=Image.open(f'{OUT}/alpaquitay-social.png').resize((480,252)); sh.paste(soc_im,(800,20))
for i,(svg,bgc) in enumerate([(l1,(1,5,20)),(l2,(255,255,255))]):
    cairosvg.svg2png(bytestring=svg.encode(),write_to='/tmp/b2/_l.png',output_height=64); l=Image.open('/tmp/b2/_l.png').convert('RGBA')
    bg=Image.new('RGBA',(l.width+30,84),bgc+(255,)); bg.alpha_composite(l,(15,10)); sh.paste(bg.convert('RGB'),(20+i*400,380))
sh.save('/tmp/b2/sheet.png')
for f in sorted(os.listdir(OUT)): print(f, os.path.getsize(f'{OUT}/{f}')//1024,'KB')
