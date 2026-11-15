# Manga-/Cyberpunk-Anime-Gesichter (Vorlage des Nutzers vom 15.11.2026):
# leuchtende pink-lila Augen mit kleinen Glanzpunkten und feiner Kontur (bewusst dezent),
# feine Brauen, Scanlines, cyanfarbene HUD-Akzente und leichter Farbversatz.
# Gezeichnet in einem großen Raster (Augenabstand 298) und auf die Leinwand von
# faces.py (530x310, Augen bei W/2±EX, EY; Mund MY) verkleinert, damit bake.py
# sie unverändert einsetzt.  Ansicht: python3 faces_anime.py <ordner>
import os, sys, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import faces as F

S = 2
K = (2 * F.EX) / 298                     # großes Raster -> Leinwand
GW, GH = round(F.W / K), round(F.H / K)  # Größe des großen Rasters
LX, RX = GW / 2 - 149, GW / 2 + 149
EY = F.EY / K
MY = EY + 80
BY = EY - 70
CX = GW / 2
PINK, VIO, CYAN, WHITE, DARK = (255, 92, 222), (150, 80, 255), (90, 240, 255), (255, 255, 255), (34, 8, 60)
LINE = (255, 232, 255, 255)

class L:
    def __init__(s): s.im = Image.new('RGBA', (GW * S, GH * S), (0, 0, 0, 0)); s.d = ImageDraw.Draw(s.im)
    def P(s, pts): return [(x * S, y * S) for x, y in pts]
    def ell(s, cx, cy, rx, ry, fill): s.d.ellipse([(cx - rx) * S, (cy - ry) * S, (cx + rx) * S, (cy + ry) * S], fill=fill)
    def line(s, pts, w, fill):
        s.d.line(s.P(pts), fill=fill, width=max(1, int(w * S)), joint='curve')
        for x, y in (pts[0], pts[-1]): s.ell(x, y, w / 2, w / 2, fill)
    def poly(s, pts, fill): s.d.polygon(s.P(pts), fill=fill)
    def arc(s, cx, cy, r, a0, a1, w, fill): s.d.arc([(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S], a0, a1, fill=fill, width=max(1, int(w * S)))
    def out(s): return s.im.resize((GW, GH), Image.LANCZOS)

def bez(p0, p1, p2, n=40):
    return [((1-t)**2*p0[0]+2*(1-t)*t*p1[0]+t*t*p2[0], (1-t)**2*p0[1]+2*(1-t)*t*p1[1]+t*t*p2[1]) for t in (i/n for i in range(n+1))]

def gradient(mask, top, bottom, y0, y1):
    g = Image.new('RGBA', mask.size); d = ImageDraw.Draw(g)
    for y in range(mask.size[1]):
        t = min(1, max(0, (y - y0) / max(1, y1 - y0)))
        d.line([(0, y), (mask.size[0], y)], fill=tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3)) + (255,))
    g.putalpha(ImageChops.multiply(g.getchannel('A'), mask)); return g

def heart_pts(cx, cy, s, n=60):
    out = []
    for i in range(n):
        t = 2 * math.pi * i / n
        out.append((cx + s * 16 * math.sin(t) ** 3 / 16, cy - s * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 16))
    return out

class Face:
    def __init__(s): s.glow = L(); s.top = L(); s.body = Image.new('RGBA', (GW, GH), (0, 0, 0, 0))
    def add(s, im): s.body.alpha_composite(im)
    def stroke(s, pts, w=7): s.top.line(pts, w, LINE); s.glow.line(pts, w * 2.2, PINK + (255,))
    # ---------- Augen ----------
    def eye(s, cx, cy, side, rx=44, ry=52, look=(0, 0), lid=0.0, low=0.0, slant=0.0, pupil=1.0, star=False, ring=False, heart=False, spiral=False):
        m = L(); m.ell(cx, cy, rx, ry, (255,) * 4)
        if lid > 0 or slant:     # Oberlid (müde, konzentriert, wütend/traurig über slant)
            cut = cy - ry + 2 * ry * lid
            m.poly([(cx - rx - 8, cy - ry - 8), (cx + rx + 8, cy - ry - 8), (cx + rx + 8, cut + side * slant), (cx - rx - 8, cut - side * slant)], (0, 0, 0, 0))
        if low > 0:              # Unterlid (lächelnde Augen)
            cut = cy + ry - 2 * ry * low
            m.poly([(cx - rx - 8, cy + ry + 8), (cx + rx + 8, cy + ry + 8), (cx + rx + 8, cut), (cx - rx - 8, cut)], (0, 0, 0, 0))
        mask = m.out().getchannel('A')
        s.add(gradient(mask, (255, 214, 250), (226, 110, 240), cy - ry, cy + ry))
        px, py = cx + look[0], cy + 10 + look[1]
        iris = L()
        if spiral:
            pts = [(px + math.cos(t) * t * rx * .07, py + math.sin(t) * t * rx * .07) for t in (i / 8 for i in range(0, 90))]
            iris.line(pts, 6, (110, 20, 170, 255))
        else:
            iris.ell(px, py + 6, rx * .74, ry * .66, (200, 50, 235, 255)); iris.ell(px, py + 6, rx * .62, ry * .55, (130, 24, 190, 255))
            if ring: iris.arc(px, py + 6, rx * .62, 200, 520, 4, CYAN + (255,))
            if star:
                r = rx * .44
                pts = [(px + math.cos(a) * (r if i % 2 == 0 else r * .38), py + 6 + math.sin(a) * (r if i % 2 == 0 else r * .38)) for i, a in enumerate([-math.pi / 2 + k * math.pi / 4 for k in range(8)])]
                iris.poly(pts, (255, 240, 120, 255))
            elif heart:
                iris.poly(heart_pts(px, py + 4, rx * .5), (255, 70, 170, 255))
            else:
                iris.ell(px, py + 8, rx * .3 * pupil, ry * .4 * pupil, DARK + (255,))
                iris.d.ellipse([(px - rx*.3*pupil - 3)*S, (py + 8 - ry*.4*pupil - 3)*S, (px + rx*.3*pupil + 3)*S, (py + 8 + ry*.4*pupil + 3)*S], outline=CYAN + (200,), width=2 * S)
        hl = L(); hl.ell(px - rx * .3, py - ry * .26, rx * .17, ry * .14, WHITE + (240,)); hl.ell(px + rx * .28, py + ry * .3, rx * .07, rx * .07, WHITE + (180,))
        for lay in (iris, hl):
            o = lay.out(); o.putalpha(ImageChops.multiply(o.getchannel('A'), mask)); s.add(o)
        sc = Image.new('RGBA', (GW, GH)); d = ImageDraw.Draw(sc)
        for y in range(int(cy - ry), int(cy + ry), 7): d.line([(cx - rx, y), (cx + rx, y)], fill=(20, 0, 50, 28), width=2)
        sc.putalpha(ImageChops.multiply(sc.getchannel('A'), mask)); s.add(sc)
        # Abgeschwächt (Wunsch 15.11.): kein Wimpernstrich mit Flick, nur feine Kontur
        top = cy - ry + 2 * ry * lid + 2
        lash = bez((cx - rx * .92, top + ry * .28 - side * slant * .9), (cx, top - ry * .16), (cx + rx * .92, top + ry * .28 + side * slant * .9))
        s.top.line(lash, 4.5, LINE); s.glow.line(lash, 10, PINK + (255,))
        s.glow.ell(cx, cy, rx + 6, ry + 6, PINK + (150,))
    def arc_eye(s, cx, cy, side, up=True, w=46):      # ^ (lachend) oder ‿ (entspannt geschlossen)
        pts = bez((cx - w, cy + 14), (cx, cy - 46), (cx + w, cy + 14)) if up else bez((cx - w, cy - 4), (cx, cy + 30), (cx + w, cy - 4))
        s.stroke(pts, 8)
    def squeeze(s, cx, cy, side):                     # > <
        d = -side
        s.stroke([(cx - 32 * d, cy - 34), (cx + 28 * d, cy), (cx - 32 * d, cy + 34)], 12)
    def shades(s):
        for cx in (LX, RX):
            m = L(); m.poly([(cx - 70, EY - 34), (cx + 70, EY - 34), (cx + 58, EY + 30), (cx - 52, EY + 36)], (255,) * 4)
            mask = m.out().getchannel('A'); s.add(gradient(mask, (80, 20, 140), (20, 4, 40), EY - 34, EY + 36))
            s.top.line([(cx - 70, EY - 34), (cx + 70, EY - 34)], 6, LINE); s.glow.line([(cx - 70, EY - 34), (cx + 70, EY - 34)], 16, PINK + (255,))
            s.top.line([(cx - 46, EY - 18), (cx - 10, EY - 18)], 7, CYAN + (230,))
        s.top.line([(LX + 70, EY - 30), (RX - 70, EY - 30)], 6, LINE)
    def brow(s, cx, side, lift=0, tilt=0):
        pts = bez((cx - side * 34, BY + 16 + lift - tilt), (cx, BY - 2 + lift), (cx + side * 36, BY + 12 + lift + tilt))
        s.top.line(pts, 5, (255, 220, 255, 230)); s.glow.line(pts, 11, PINK + (200,))
    def blush(s, cx, cy):
        for k in range(3): s.top.line([(cx - 22 + k * 15, cy + 12), (cx - 30 + k * 15, cy + 24)], 4, (255, 120, 200, 230))
    def tear(s, cx, cy):
        s.top.poly([(cx, cy), (cx - 11, cy + 26), (cx, cy + 36), (cx + 11, cy + 26)], (150, 220, 255, 255)); s.glow.ell(cx, cy + 24, 16, 20, CYAN + (200,))
    # ---------- Mund ----------
    def smile(s, w=34):
        s.stroke(bez((CX - w, MY - 6), (CX, MY + 22), (CX + w, MY - 6)))
    def open_smile(s, w=38, depth=46):
        m = L(); m.poly(bez((CX - w, MY - 8), (CX, MY + depth), (CX + w, MY - 8)), (255,) * 4)
        mask = m.out().getchannel('A'); s.add(gradient(mask, (90, 20, 140), (255, 110, 210), MY - 8, MY + 30))
        s.top.line(bez((CX - w, MY - 8), (CX, MY + depth), (CX + w, MY - 8)), 5, LINE); s.stroke([(CX - w, MY - 8), (CX + w, MY - 8)], 5)
    def oval(s, rx, ry):
        m = L(); m.ell(CX, MY + 4, rx, ry, (255,) * 4); mask = m.out().getchannel('A'); s.add(gradient(mask, (90, 20, 140), (255, 110, 210), MY - ry, MY + ry))
        s.top.d.ellipse([(CX - rx) * S, (MY + 4 - ry) * S, (CX + rx) * S, (MY + 4 + ry) * S], outline=LINE, width=5 * S); s.glow.ell(CX, MY + 4, rx + 6, ry + 6, PINK + (200,))
    def o_mouth(s): s.top.d.ellipse([(CX - 16) * S, (MY - 14) * S, (CX + 16) * S, (MY + 20) * S], outline=LINE, width=7 * S); s.glow.ell(CX, MY + 3, 22, 24, PINK + (200,))
    def flat(s, w=24): s.stroke([(CX - w, MY + 2), (CX + w, MY - 2)])
    def frown(s, w=30): s.stroke(bez((CX - w, MY + 14), (CX, MY - 12), (CX + w, MY + 14)))
    def wave(s, w=36): s.stroke([(CX - w + i * 2 * w / 30, MY + 7 * math.sin(i / 30 * 4 * math.pi)) for i in range(31)], 6)
    def smirk(s): s.stroke([(CX - 28, MY + 6), (CX + 18, MY - 2), (CX + 32, MY - 12)])
    def tongue(s):
        s.smile(36); m = L(); m.ell(CX + 6, MY + 20, 14, 16, (255,) * 4); mask = m.out().getchannel('A'); s.add(gradient(mask, (255, 150, 220), (230, 60, 160), MY + 6, MY + 36))
    def kiss(s):
        s.stroke(bez((CX - 4, MY - 16), (CX + 18, MY - 4), (CX - 4, MY + 2)), 6); s.stroke(bez((CX - 4, MY + 2), (CX + 18, MY + 10), (CX - 4, MY + 20)), 6)
        s.top.poly(heart_pts(CX + 62, MY - 26, 16), (255, 90, 190, 255)); s.glow.ell(CX + 62, MY - 26, 22, 22, PINK + (220,))
    def dots(s):
        for k in range(3): s.top.ell(CX - 22 + k * 22, MY + 6, 5, 5, CYAN + (255,) if k < 2 else (255, 230, 255, 170))
    # ---------- HUD ----------
    def loading(s):
        x, y = RX + 76, EY - 58
        s.top.arc(x, y, 18, 300, 550, 5, CYAN + (255,)); s.glow.arc(x, y, 18, 300, 550, 12, CYAN + (255,))
    def brackets(s):
        for cx, side in ((LX, -1), (RX, 1)):
            x = cx + side * 74
            s.top.line([(x, EY - 40), (x + side * 8, EY - 40), (x + side * 8, EY - 20)], 3, CYAN + (190,))
            s.top.line([(x, EY + 46), (x + side * 8, EY + 46), (x + side * 8, EY + 26)], 3, CYAN + (190,))
    def render(s):
        out = Image.new('RGBA', (GW, GH), (0, 0, 0, 0))
        g = s.glow.out().filter(ImageFilter.GaussianBlur(14))
        g.putalpha(g.getchannel('A').point(lambda v: min(255, int(v * 1.25))))
        ca = Image.new('RGBA', (GW, GH), CYAN + (0,)); ca.putalpha(g.getchannel('A').point(lambda v: int(v * .35)))
        out.alpha_composite(ca, (-4, 0)); out.alpha_composite(g); out.alpha_composite(s.body); out.alpha_composite(s.top.out())
        return out.resize((F.W, F.H), Image.LANCZOS)

def build(name):
    f = Face(); both = ((LX, -1), (RX, 1))
    def brows(lift=0, tilt=0):
        for cx, side in both: f.brow(cx, side, lift, tilt)
    if name in ('idle', 'talkA', 'talkB'):
        brows(); [f.eye(cx, EY, side) for cx, side in both]
        if name == 'idle': f.smile(); f.brackets()
        elif name == 'talkA': f.oval(22, 18)
        else: f.oval(16, 9)
    elif name == 'blink':
        brows(); [f.arc_eye(cx, EY + 10, side, up=False) for cx, side in both]; f.smile()
    elif name == 'happy':
        brows(-8); [f.arc_eye(cx, EY, side) for cx, side in both]; f.blush(LX - 20, EY + 40); f.blush(RX + 20, EY + 40); f.open_smile()
    elif name == 'focus':
        brows(8, -6); [f.eye(cx, EY + 4, side, lid=.3, ring=True) for cx, side in both]; f.flat(); f.brackets()
    elif name == 'busy':                                   # arbeitet am Video: konzentriert, Lade-Ring
        brows(10, -8); [f.eye(cx, EY, side, lid=.34, look=(10, 8), ring=True) for cx, side in both]; f.flat(); f.dots(); f.loading()
    elif name == 'wink':
        f.brow(LX, -1); f.brow(RX, 1, -6); f.eye(LX, EY, -1); f.arc_eye(RX, EY, 1); f.blush(RX + 20, EY + 40); f.smile(30)
    elif name == 'surprised':
        brows(-22); [f.eye(cx, EY, side, rx=54, ry=70, pupil=.55) for cx, side in both]; f.o_mouth()
    elif name == 'dizzy':
        brows(-6, 6); [f.eye(cx, EY, side, spiral=True) for cx, side in both]; f.wave()
    elif name == 'laugh':
        brows(-12); [f.squeeze(cx, EY, side) for cx, side in both]; f.blush(LX - 20, EY + 40); f.blush(RX + 20, EY + 40); f.open_smile(44, 56)
    elif name == 'love':
        brows(-10); [f.eye(cx, EY, side, heart=True) for cx, side in both]; f.blush(LX - 20, EY + 44); f.blush(RX + 20, EY + 44); f.smile(32)
    elif name == 'kiss':
        brows(-6); [f.arc_eye(cx, EY, side) for cx, side in both]; f.blush(LX - 20, EY + 40); f.blush(RX + 20, EY + 40); f.kiss()
    elif name == 'angry':
        brows(14, 22); [f.eye(cx, EY + 6, side, ry=56, slant=-34, pupil=.8) for cx, side in both]; f.frown(26)
    elif name == 'sleepy':
        brows(10); [f.arc_eye(cx, EY + 16, side, up=False, w=40) for cx, side in both]; f.oval(10, 8)
    elif name == 'tongue':
        brows(-8); [f.arc_eye(cx, EY, side) for cx, side in both]; f.tongue()
    elif name == 'sad':
        brows(6, -20); [f.eye(cx, EY + 6, side, ry=58, slant=26, look=(0, 6)) for cx, side in both]; f.tear(LX + 26, EY + 58); f.tear(RX - 26, EY + 58); f.frown()
    elif name == 'cool':
        brows(-4); f.shades(); f.smirk()
    elif name == 'star':                                   # fertig / stolz: Glitzeraugen
        brows(-10); [f.eye(cx, EY, side, star=True) for cx, side in both]; f.open_smile(); f.brackets()
    elif name == 'confused':
        f.brow(LX, -1, -14); f.brow(RX, 1, 10, -10); f.eye(LX, EY, -1, rx=54, ry=68); f.eye(RX, EY + 8, 1, rx=40, ry=40, lid=.25); f.wave(30)
    else:
        raise KeyError(name)
    return f

def face(name):
    return build(name).render()

if __name__ == '__main__':
    os.makedirs(sys.argv[1], exist_ok=True)
    for n in F.FACES:
        bg = Image.new('RGBA', (F.W, F.H), (14, 8, 22, 255)); bg.alpha_composite(face(n)); bg.save(os.path.join(sys.argv[1], n + '.png'))
