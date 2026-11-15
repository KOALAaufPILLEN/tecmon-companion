# Ruhige Roboter-Augen (Wunsch 15.11.2026: "schöne Augen vom Roboter, entspannt"):
# leuchtende, abgerundete Visier-Augen ohne Iris und ohne Manga-Details, leicht
# gesenktes Oberlid, weicher Glow, kleiner Mund-Strich.  Gleiche Leinwand wie
# faces.py, damit bake.py sie unverändert einsetzt.  Ansicht: python3 faces_robot.py <ordner>
import os, sys, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import faces as F
from faces_anime import L, bez, gradient, heart_pts, GW, GH, LX, RX, EY, MY, CX, PINK, CYAN, LINE

TOP, BOT = (255, 200, 250), (230, 70, 220)

class Face:
    def __init__(s): s.glow = L(); s.top = L(); s.body = Image.new('RGBA', (GW, GH), (0, 0, 0, 0))
    def fill(s, m, y0, y1):
        mask = m.out().getchannel('A'); s.add(gradient(mask, TOP, BOT, y0, y1)); return mask
    def add(s, im): s.body.alpha_composite(im)
    def stroke(s, pts, w=8): s.top.line(pts, w, (255, 225, 252, 255)); s.glow.line(pts, w * 2.4, PINK + (255,))
    def eye(s, cx, cy, w=58, h=66, lid=.22, tilt=0, low=0, look=(0, 0), shine=True):
        cx += look[0]; cy += look[1]; w *= 1.55; h *= 1.55
        m = L(); m.d.rounded_rectangle([(cx - w / 2) * S, (cy - h / 2) * S, (cx + w / 2) * S, (cy + h / 2) * S], radius=int(min(w, h) * .46 * S), fill=(255,) * 4)
        if lid > 0 or tilt:   # entspanntes Oberlid: flache Kante, optional schräg
            cut = cy - h / 2 + h * lid
            m.poly([(cx - w, cy - h), (cx + w, cy - h), (cx + w, cut + tilt), (cx - w, cut - tilt)], (0, 0, 0, 0))
        if low > 0:
            m.ell(cx, cy + h * (1.05 - low), w * .95, h * .62, (0, 0, 0, 0))
        mask = s.fill(m, cy - h / 2, cy + h / 2)
        sc = Image.new('RGBA', (GW, GH)); d = ImageDraw.Draw(sc)
        for y in range(int(cy - h / 2), int(cy + h / 2), 6): d.line([(cx - w, y), (cx + w, y)], fill=(60, 0, 80, 34), width=2)
        sc.putalpha(ImageChops.multiply(sc.getchannel('A'), mask)); s.add(sc)
        if shine:
            hl = L(); hl.ell(cx - w * .18, cy - h / 2 + h * lid + h * .2, w * .1, h * .07, (255, 255, 255, 200))
            o = hl.out(); o.putalpha(ImageChops.multiply(o.getchannel('A'), mask)); s.add(o)
        g = Image.new('RGBA', (GW, GH), PINK + (0,)); g.putalpha(mask.filter(ImageFilter.MaxFilter(9)))
        s.glow.im.alpha_composite(g.resize(s.glow.im.size))
    def arc(s, cx, cy, up=True, w=50):
        s.stroke(bez((cx - w, cy + 18), (cx, cy - 48), (cx + w, cy + 18)) if up else bez((cx - w, cy - 2), (cx, cy + 30), (cx + w, cy - 2)), 15)
    def x_eye(s, cx, cy):
        s.stroke([(cx - 32, cy - 32), (cx + 32, cy + 32)], 13); s.stroke([(cx + 32, cy - 32), (cx - 32, cy + 32)], 13)
    def heart(s, cx, cy):
        m = L(); m.poly(heart_pts(cx, cy, 52), (255,) * 4); s.fill(m, cy - 34, cy + 30); s.glow.ell(cx, cy, 60, 60, PINK + (200,))
    def star(s, cx, cy, r=56):
        m = L(); pts = [(cx + math.cos(a) * (r if i % 2 == 0 else r * .42), cy + math.sin(a) * (r if i % 2 == 0 else r * .42)) for i, a in enumerate([-math.pi / 2 + k * math.pi / 4 for k in range(8)])]
        m.poly(pts, (255,) * 4); s.fill(m, cy - r, cy + r); s.glow.ell(cx, cy, r + 8, r + 8, PINK + (210,))
    def smile(s, w=34, d=18): s.stroke(bez((CX - w, MY - 4), (CX, MY + d), (CX + w, MY - 4)), 8)
    def flat(s, w=18): s.stroke([(CX - w, MY), (CX + w, MY)], 6)
    def frown(s, w=22): s.stroke(bez((CX - w, MY + 10), (CX, MY - 8), (CX + w, MY + 10)), 6)
    def o(s, r=11): s.top.d.ellipse([(CX - r) * S, (MY - r) * S, (CX + r) * S, (MY + r + 4) * S], outline=(255, 225, 252, 255), width=6 * S); s.glow.ell(CX, MY + 2, r + 8, r + 8, PINK + (200,))
    def wave(s, w=26): s.stroke([(CX - w + i * 2 * w / 24, MY + 5 * math.sin(i / 24 * 4 * math.pi)) for i in range(25)], 5)
    def loading(s):
        x, y = RX + 80, EY - 62
        s.top.arc(x, y, 14, 300, 550, 4, CYAN + (255,)); s.glow.arc(x, y, 14, 300, 550, 10, CYAN + (255,))
    def dots(s):
        for k in range(3): s.top.ell(CX - 18 + k * 18, MY + 2, 4, 4, CYAN + (255,) if k < 2 else (255, 230, 255, 160))
    def render(s):
        out = Image.new('RGBA', (GW, GH), (0, 0, 0, 0))
        g = s.glow.out().filter(ImageFilter.GaussianBlur(16)); g.putalpha(g.getchannel('A').point(lambda v: int(v * .9)))
        out.alpha_composite(g); out.alpha_composite(s.body); out.alpha_composite(s.top.out())
        return out.resize((F.W, F.H), Image.LANCZOS)

from faces_anime import S

def build(n):
    f = Face(); E = (LX, RX)
    if n in ('idle', 'talkA', 'talkB'):
        [f.eye(x, EY) for x in E]
        f.smile() if n == 'idle' else f.o(12 if n == 'talkA' else 7)
    elif n == 'blink': [f.arc(x, EY + 8, up=False) for x in E]; f.smile()
    elif n == 'happy': [f.eye(x, EY, lid=.1, low=.42) for x in E]; f.smile(30, 18)
    elif n == 'focus': [f.eye(x, EY + 4, lid=.4) for x in E]; f.flat()
    elif n == 'busy': [f.eye(x, EY + 2, lid=.36, look=(8, 4)) for x in E]; f.dots(); f.loading()
    elif n == 'wink': f.eye(LX, EY); f.arc(RX, EY + 4); f.smile(24)
    elif n == 'surprised': [f.eye(x, EY, w=64, h=78, lid=0) for x in E]; f.o(12)
    elif n == 'dizzy': [f.x_eye(x, EY) for x in E]; f.wave()
    elif n == 'laugh': [f.arc(x, EY) for x in E]; f.smile(32, 24)
    elif n == 'love': [f.heart(x, EY) for x in E]; f.smile()
    elif n == 'kiss': [f.arc(x, EY) for x in E]; f.o(7)
    elif n == 'angry': f.eye(LX, EY + 6, lid=.36, tilt=14); f.eye(RX, EY + 6, lid=.36, tilt=-14); f.frown()
    elif n == 'sleepy': [f.eye(x, EY + 12, h=50, lid=.6, shine=False) for x in E]; f.flat(12)
    elif n == 'tongue': f.eye(LX, EY); f.arc(RX, EY + 4); f.smile(26, 16); f.top.ell(CX + 6, MY + 12, 9, 9, (255, 140, 210, 255))
    elif n == 'sad': f.eye(LX, EY + 8, lid=.34, tilt=-12); f.eye(RX, EY + 8, lid=.34, tilt=12); f.frown()
    elif n == 'cool': [f.eye(x, EY + 6, w=78, h=40, lid=.0) for x in E]; f.stroke([(LX + 60, EY - 2), (RX - 60, EY - 2)], 6); f.smile(20, 8)
    elif n == 'star': [f.star(x, EY) for x in E]; f.smile(30, 18)
    elif n == 'confused': f.eye(LX, EY - 4, lid=.1); f.eye(RX, EY + 6, h=46, lid=.3); f.wave(22)
    else: raise KeyError(n)
    return f

def face(name): return build(name).render()

if __name__ == '__main__':
    os.makedirs(sys.argv[1], exist_ok=True)
    for n in F.FACES:
        bg = Image.new('RGBA', (F.W, F.H), (14, 8, 22, 255)); bg.alpha_composite(face(n)); bg.save(os.path.join(sys.argv[1], n + '.png'))
