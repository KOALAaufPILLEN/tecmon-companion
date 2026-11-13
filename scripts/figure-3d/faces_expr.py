# Ausdrucksstarke Holo-Gesichter: Augen mit Iris, Pupille und Glanzlichtern,
# Augenbrauen, Wangen, Tränen und ausgeformte Münder. Gleiche Leinwand und
# gleiche Augen-/Mundmitte wie faces.py, damit bake.py sie unverändert einsetzt.
import os, sys, math
from PIL import Image, ImageDraw, ImageFilter, ImageChops
import faces as F

W, H = F.W, F.H
S = 4                      # Überabtastung
LX, RX, EY, MY = W / 2 - F.EX, W / 2 + F.EX, F.EY, F.MY
COL = dict(top=(252, 248, 255), bottom=(170, 132, 255), glow=(139, 92, 246), halo=(200, 175, 255),
           iris=(214, 196, 255), pupil=(46, 16, 96), pink=(255, 120, 200), dark=(26, 10, 46), tear=(150, 210, 255))
LAYERS = ('light', 'iris', 'pink', 'dark', 'pupil', 'white', 'tear')

class Canvas:
    def __init__(self):
        self.m = {k: Image.new('L', (W * S, H * S), 0) for k in LAYERS}
        self.d = {k: ImageDraw.Draw(v) for k, v in self.m.items()}
    def sc(self, pts): return [(x * S, y * S) for x, y in pts]
    def box(self, x0, y0, x1, y1): return [x0 * S, y0 * S, x1 * S, y1 * S]
    def ellipse(self, layer, cx, cy, rx, ry, fill=255): self.d[layer].ellipse(self.box(cx - rx, cy - ry, cx + rx, cy + ry), fill=fill)
    def capsule(self, layer, cx, cy, rx, ry, fill=255): self.d[layer].rounded_rectangle(self.box(cx - rx, cy - ry, cx + rx, cy + ry), radius=rx * S, fill=fill)
    def poly(self, layer, pts, fill=255): self.d[layer].polygon(self.sc(pts), fill=fill)
    def line(self, layer, pts, width, fill=255):
        self.d[layer].line(self.sc(pts), fill=fill, width=int(width * S), joint='curve')
        r = width / 2
        for x, y in (pts[0], pts[-1]): self.ellipse(layer, x, y, r, r, fill)
    def curve(self, layer, fn, t0, t1, width, n=40):  # Linie entlang fn(t) -> (x, y)
        self.line(layer, [fn(t0 + (t1 - t0) * i / n) for i in range(n + 1)], width)
    def cut(self, pts, layers=('light', 'iris', 'pupil', 'white')):  # Lid: Bereich aus den Augen löschen
        for k in layers: self.d[k].polygon(self.sc(pts), fill=0)

def bez(p0, p1, p2):
    return lambda t: ((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1])

# ---------- Augen ----------
def eye_open(c, cx, cy, rx=30, ry=50, look=(0, 0), pupil=1.0, iris=True):
    c.capsule('light', cx, cy, rx, ry)
    px, py = cx + look[0], cy + 8 + look[1]
    if iris: c.ellipse('iris', px, py + 4, rx * 0.78, ry * 0.62)
    c.ellipse('pupil', px, py + 6, rx * 0.5 * pupil, ry * 0.42 * pupil)
    c.ellipse('white', px - rx * 0.32, py - ry * 0.28, rx * 0.26, ry * 0.2)
    c.ellipse('white', px + rx * 0.22, py + ry * 0.3, rx * 0.11, rx * 0.11)

def eye_round(c, cx, cy, r=40, pupil=0.45):
    c.ellipse('light', cx, cy, r, r)
    c.ellipse('iris', cx, cy + 2, r * 0.8, r * 0.8)
    c.ellipse('pupil', cx, cy + 3, r * pupil, r * pupil)
    c.ellipse('white', cx - r * 0.38, cy - r * 0.38, r * 0.2, r * 0.2)
    c.ellipse('white', cx + r * 0.25, cy + r * 0.3, r * 0.09, r * 0.09)

def eye_happy(c, cx, cy, w=34, lift=20, width=12):   # ^ geschlossen, lächelnd
    c.curve('light', bez((cx - w, cy + 10), (cx, cy - lift - 22), (cx + w, cy + 10)), 0, 1, width)

def eye_closed(c, cx, cy, w=32, sag=10, width=9):     # ‿ entspannt geschlossen
    c.curve('light', bez((cx - w, cy), (cx, cy + sag * 2), (cx + w, cy)), 0, 1, width)

def eye_squeeze(c, cx, cy, side):                      # > <
    s = -side
    c.line('light', [(cx - 30 * s, cy - 32), (cx + 26 * s, cy), (cx - 30 * s, cy + 32)], 15)

def eye_heart(c, cx, cy, s=40):
    pts = []
    for i in range(80):
        t = 2 * math.pi * i / 80
        x = 16 * math.sin(t) ** 3; y = 13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)
        pts.append((cx + x * s / 17, cy - y * s / 17 + 2))
    c.poly('pink', pts); c.poly('light', [(x, y) for x, y in pts], fill=110)
    c.ellipse('white', cx - s * 0.4, cy - s * 0.35, s * 0.16, s * 0.12)

def eye_star(c, cx, cy, r=42):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5; rr = r if i % 2 == 0 else r * 0.45
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    c.poly('light', pts); c.ellipse('iris', cx, cy + 3, r * 0.3, r * 0.3)
    c.ellipse('white', cx - r * 0.18, cy - r * 0.3, r * 0.1, r * 0.1)

def eye_spiral(c, cx, cy, r=38):
    c.curve('light', lambda t: (cx + (4 + r * t) * math.cos(t * 4 * math.pi), cy + (4 + r * t) * math.sin(t * 4 * math.pi)), 0, 1, 9, n=120)

def eye_scan(c, cx, cy):                                # Arbeiten: eckiges Display mit Scanbalken
    c.d['light'].rounded_rectangle(c.box(cx - 30, cy - 30, cx + 30, cy + 30), radius=10 * S, fill=255)
    c.d['dark'].rounded_rectangle(c.box(cx - 22, cy - 22, cx + 22, cy + 22), radius=6 * S, fill=255)
    c.d['iris'].rectangle(c.box(cx - 20, cy - 4, cx + 20, cy + 4), fill=255)
    c.d['white'].rectangle(c.box(cx - 20, cy - 2, cx + 20, cy + 2), fill=200)

def shades(c):                                          # Sonnenbrille über beide Augen
    for cx in (LX, RX):
        pts = [(cx - 44, EY - 26), (cx + 44, EY - 26), (cx + 40, EY + 6), (cx + 20, EY + 26), (cx - 22, EY + 26), (cx - 42, EY + 4)]
        c.poly('light', pts); c.poly('dark', [(x * 0.86 + cx * 0.14, y * 0.8 + EY * 0.2) for x, y in pts])
        c.line('white', [(cx - 26, EY - 6), (cx - 8, EY - 16)], 5); c.line('white', [(cx - 18, EY + 8), (cx + 8, EY - 8)], 4)
    c.line('light', [(LX + 42, EY - 20), (RX - 42, EY - 20)], 9)

# ---------- Augenbrauen ----------
def brows(c, inner, outer, y=EY - 72, width=10, length=40, curve=0.0):
    # inner/outer: Höhenversatz am inneren bzw. äußeren Ende (negativ = höher)
    for side, cx in ((-1, LX), (1, RX)):
        xi, xo = cx - side * length / 2, cx + side * length / 2
        mid = ((xi + xo) / 2, y + (inner + outer) / 2 - curve)
        c.curve('light', bez((xo, y + outer), mid, (xi, y + inner)), 0, 1, width)

def brow_one(c, side, inner, outer, y=EY - 72):
    cx = LX if side < 0 else RX; xi, xo = cx - side * 20, cx + side * 20
    c.curve('light', bez((xo, y + outer), ((xi + xo) / 2, y + (inner + outer) / 2 - 6), (xi, y + inner)), 0, 1, 10)

# ---------- Extras ----------
def cheeks(c, alpha=150):
    for cx in (LX - 14, RX + 14): c.ellipse('pink', cx, EY + 62, 30, 13, fill=alpha)

def tear(c, cx, cy, s=1.0):
    pts = [(cx + 11 * s * math.sin(t), cy + 14 * s * (1 - math.cos(t)) * (0.75 if math.cos(t) < 0 else 1) - 6 * s) for t in [i * 2 * math.pi / 40 for i in range(40)]]
    pts = [(cx, cy - 22 * s)] + [(x, y) for x, y in pts if y >= cy - 6 * s]
    c.poly('tear', pts); c.ellipse('white', cx - 3 * s, cy + 2 * s, 3 * s, 4 * s)

def sweat(c, x, y): tear(c, x, y, 0.9)

def zz(c):
    for (x, y, s) in ((W - 120, 46, 1.0), (W - 80, 22, 0.7)):
        c.line('light', [(x, y), (x + 26 * s, y), (x, y + 24 * s), (x + 26 * s, y + 24 * s)], 6 * s)

def small_heart(c, x, y, s=14):
    pts = []
    for i in range(48):
        t = 2 * math.pi * i / 48
        pts.append((x + 16 * math.sin(t) ** 3 * s / 17, y - (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) * s / 17))
    c.poly('pink', pts)

# ---------- Münder ----------
def m_smile(c, w=34, d=16, width=9):
    c.curve('light', bez((W / 2 - w, MY - 4), (W / 2, MY + d * 2 - 4), (W / 2 + w, MY - 4)), 0, 1, width)

def m_frown(c, w=30, d=12, width=9):
    c.curve('light', bez((W / 2 - w, MY + 8), (W / 2, MY - d * 2 + 8), (W / 2 + w, MY + 8)), 0, 1, width)

def m_open(c, w=34, h=26, tongue=True, teeth=False):   # D-förmig offener Mund
    top = MY - 8; pts = [(W / 2 - w, top)] + [(W / 2 + w * math.cos(math.pi * i / 30), top + h * math.sin(math.pi * i / 30)) for i in range(31)] + [(W / 2 + w, top)]
    pts = [(W / 2 + w * math.cos(math.pi * i / 30), top + h * math.sin(math.pi * i / 30)) for i in range(31)]
    c.poly('light', [(x, y) for x, y in pts]); inner = [(W / 2 + (x - W / 2) * 0.82, top + 3 + (y - top) * 0.78) for x, y in pts]
    c.poly('dark', inner)
    if tongue: c.ellipse('pink', W / 2 + 4, top + h * 0.66, w * 0.42, h * 0.26)
    if teeth: c.d['light'].rectangle(c.box(W / 2 - w * 0.7, top + 2, W / 2 + w * 0.7, top + 8), fill=255)

def m_oval(c, rx, ry, tongue=False):
    c.ellipse('light', W / 2, MY, rx, ry); c.ellipse('dark', W / 2, MY + 1, rx * 0.72, ry * 0.68)
    if tongue: c.ellipse('pink', W / 2 + 2, MY + ry * 0.35, rx * 0.45, ry * 0.3)

def m_wave(c):
    c.curve('light', lambda t: (W / 2 - 36 + 72 * t, MY + 7 * math.sin(t * 3.4 * math.pi)), 0, 1, 7, n=60)

def m_smirk(c):
    c.curve('light', bez((W / 2 - 26, MY + 4), (W / 2 + 6, MY + 12), (W / 2 + 30, MY - 10)), 0, 1, 8)

def m_kiss(c):
    c.curve('light', lambda t: (W / 2 + 6 * math.sin(t * 2 * math.pi) - 2, MY - 14 + 28 * t), 0, 1, 7)
    small_heart(c, W / 2 + 52, MY - 26, 16)

def m_dots(c):
    for i, a in enumerate((255, 190, 120)): c.ellipse('light', W / 2 - 24 + 24 * i, MY, 6, 6, fill=a)

# ---------- Formen der Vorlage (kräftig, klar lesbar) ----------
def eye_block(c, cx, cy, rx=30, ry=52):                 # hohes, abgerundetes Leuchtfeld
    c.d['light'].rounded_rectangle(c.box(cx - rx, cy - ry, cx + rx, cy + ry), radius=min(rx, 18) * S, fill=255)

def eye_oval(c, cx, cy, rx, ry): c.ellipse('light', cx, cy, rx, ry)

def eye_ring(c, cx, cy, r=42, width=13):
    c.ellipse('light', cx, cy, r, r); c.ellipse('light', cx, cy, r - width, r - width, fill=0)

def eye_line(c, cx, cy, w=34, width=13): c.line('light', [(cx - w, cy), (cx + w, cy)], width)

def eye_slant(c, cx, cy, side, tilt, ry=40):            # Block mit schräg abgeschnittener Oberkante
    eye_block(c, cx, cy, 32, ry)
    c.cut([(cx - 50, cy - ry - 20), (cx + 50, cy - ry - 20), (cx + 50, cy - 8 - side * tilt), (cx - 50, cy - 8 + side * tilt)])

def eye_sparkle(c, cx, cy, r=46):                        # große Glitzeraugen
    c.ellipse('light', cx, cy, r, r); c.ellipse('pupil', cx, cy + 2, r * 0.74, r * 0.74)
    c.ellipse('iris', cx, cy + r * 0.34, r * 0.5, r * 0.3)
    c.ellipse('white', cx - r * 0.3, cy - r * 0.3, r * 0.26, r * 0.26)
    c.ellipse('white', cx + r * 0.34, cy + r * 0.2, r * 0.13, r * 0.13)

def big_shades(c):
    for side, cx in ((-1, LX), (1, RX)):
        pts = [(cx - 62, EY - 34), (cx + 62, EY - 34), (cx + 58 - (side < 0) * 6, EY + 14), (cx + 36, EY + 38), (cx - 36, EY + 38), (cx - 58 + (side > 0) * 6, EY + 14)]
        c.poly('light', pts)
        for k in (-34, -6, 22):                          # schräge Streifen
            c.line('dark', [(cx + k, EY + 30), (cx + k + 30, EY - 28)], 7)
    c.line('light', [(LX + 50, EY - 26), (RX - 50, EY - 26)], 16)
    c.cut([(0, EY - 80), (W, EY - 80), (W, EY - 34), (0, EY - 34)], layers=('dark',))
    c.cut([(0, EY + 38), (W, EY + 38), (W, H), (0, H)], layers=('dark',))

def blush(c, alpha=190, hatch=False):
    for cx in (LX - 6, RX + 6):
        c.ellipse('pink', cx, EY + 70, 32, 13, fill=alpha)
        if hatch:
            for k in (-14, 0, 14): c.line('white', [(cx + k - 4, EY + 76), (cx + k + 4, EY + 64)], 3, fill=150)

def m_ring(c, rx, ry, width=11):
    c.ellipse('light', W / 2, MY, rx, ry); c.ellipse('light', W / 2, MY, rx - width, ry - width, fill=0)

def m_zigzag(c, w=44, n=6, amp=9, width=10):
    c.line('light', [(W / 2 - w + 2 * w * i / n, MY + (amp if i % 2 else -amp)) for i in range(n + 1)], width)

def m_squiggle(c, w=30, width=10):
    c.curve('light', lambda t: (W / 2 - w + 2 * w * t, MY + 8 * math.sin(t * 3 * math.pi)), 0, 1, width, n=60)

def m_three(c):                                           # Kussmund "3"
    c.curve('light', bez((W / 2 - 10, MY - 22), (W / 2 + 22, MY - 12), (W / 2 - 4, MY)), 0, 1, 10)
    c.curve('light', bez((W / 2 - 4, MY), (W / 2 + 22, MY + 12), (W / 2 - 10, MY + 22)), 0, 1, 10)

def m_big(c, w=44, h=40, tongue=True):                   # weit offener Lachmund
    top = MY - 18
    pts = [(W / 2 + w * math.cos(math.pi * i / 30), top + h * math.sin(math.pi * i / 30)) for i in range(31)]
    c.poly('light', pts)
    if tongue: c.ellipse('pink', W / 2, top + h * 0.72, w * 0.5, h * 0.3)

def tears(c):
    for cx in (LX, RX):
        c.d['tear'].rounded_rectangle(c.box(cx - 13, EY + 30, cx + 13, EY + 92), radius=13 * S, fill=255)
        c.line('white', [(cx - 4, EY + 40), (cx - 4, EY + 70)], 4, fill=170)

# ---------- Ausdrücke ----------
def build(name):
    c = Canvas()
    both = ((-1, LX), (1, RX))
    if name == 'idle':
        for _, cx in both: eye_block(c, cx, EY)
        m_smile(c, w=22, d=9, width=11)
    elif name == 'blink':
        for _, cx in both: eye_closed(c, cx, EY + 4, w=36, sag=11, width=13)
        m_smile(c, w=22, d=9, width=11)
    elif name == 'happy':
        for _, cx in both: eye_happy(c, cx, EY + 4, w=38, lift=24, width=15)
        blush(c); m_big(c, w=36, h=32)
    elif name == 'talkA':
        for _, cx in both: eye_block(c, cx, EY - 4)
        m_ring(c, 20, 26)
    elif name == 'talkB':
        for _, cx in both: eye_block(c, cx, EY - 4)
        m_ring(c, 30, 16, width=10)
    elif name == 'focus':
        for side, cx in both: eye_slant(c, cx, EY + 12, side, 16, ry=38)
        brows(c, 16, -12, y=EY - 44, width=13, length=64)
        c.line('light', [(W / 2 - 28, MY + 6), (W / 2 + 28, MY + 6)], 12)
    elif name == 'busy':
        for side, cx in both:
            x = cx + side * 58
            c.line('light', [(x - side * 20, EY - 48), (x, EY - 48), (x, EY + 48), (x - side * 20, EY + 48)], 13)
            c.ellipse('light', cx - side * 8, EY - 4, 17, 17)
        c.line('light', [(W / 2 - 34, EY + 34), (W / 2 + 34, EY + 34)], 13)
    elif name == 'wink':
        eye_oval(c, LX, EY, 30, 44); c.ellipse('white', LX - 9, EY - 16, 8, 10)
        eye_squeeze(c, RX, EY, -1)
        blush(c); m_big(c, w=34, h=30); small_heart(c, RX + 70, EY - 50, 16)
    elif name == 'surprised':
        for _, cx in both: eye_ring(c, cx, EY - 2)
        m_ring(c, 18, 22)
    elif name == 'dizzy':
        for _, cx in both: eye_spiral(c, cx, EY, r=40)
        m_zigzag(c)
    elif name == 'laugh':
        for side, cx in both: eye_squeeze(c, cx, EY, side)
        m_big(c, w=46, h=42)
    elif name == 'love':
        for _, cx in both: eye_heart(c, cx, EY, s=54)
        blush(c, hatch=True); m_smile(c, w=24, d=10, width=11)
    elif name == 'kiss':
        for _, cx in both: eye_happy(c, cx, EY + 6, w=36, lift=18, width=14)
        blush(c, 150); m_three(c); small_heart(c, W / 2 + 56, MY - 6, 20)
    elif name == 'angry':
        for side, cx in both: eye_slant(c, cx, EY + 10, side, -26, ry=44)
        brows(c, 22, -22, y=EY - 48, width=15, length=72)
        m_frown(c, w=32, d=13, width=12)
    elif name == 'sleepy':
        for _, cx in both: eye_line(c, cx, EY + 8)
        m_ring(c, 11, 11, width=6)
    elif name == 'tongue':
        for side, cx in both: eye_squeeze(c, cx, EY, side)
        m_smile(c, w=34, d=10, width=11)
        c.d['pink'].rounded_rectangle(c.box(W / 2 - 16, MY + 2, W / 2 + 16, MY + 44), radius=16 * S, fill=255)
        c.line('dark', [(W / 2, MY + 10), (W / 2, MY + 30)], 3)
    elif name == 'sad':
        for side, cx in both: eye_slant(c, cx, EY, side, 18, ry=34)
        brows(c, -16, 10, y=EY - 62, width=12, length=56)
        tears(c); m_frown(c, w=26, d=12, width=11)
    elif name == 'cool':
        big_shades(c); c.curve('light', bez((W / 2 - 30, MY + 12), (W / 2 + 8, MY + 22), (W / 2 + 36, MY - 4)), 0, 1, 11)
    elif name == 'star':                                   # Vorlage "shy": Glitzeraugen, rote Wangen
        for _, cx in both: eye_sparkle(c, cx, EY - 2)
        blush(c, hatch=True); m_squiggle(c, w=24)
    elif name == 'confused':
        eye_oval(c, LX, EY - 4, 36, 48); eye_oval(c, RX, EY + 4, 24, 28)
        m_squiggle(c, w=34)
    return c

def compose(c):
    m = {k: v.resize((W, H), Image.LANCZOS) for k, v in c.m.items()}
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    def lay(msk, col, alpha=1.0):
        layer = Image.new('RGBA', (W, H), col + (0,)); layer.putalpha(msk.point(lambda v: int(v * alpha))); out.alpha_composite(layer)
    lit = ImageChops.lighter(ImageChops.lighter(m['light'], m['pink']), m['tear'])
    lay(lit.filter(ImageFilter.GaussianBlur(14)), COL['glow'], 0.85)
    lay(lit.filter(ImageFilter.GaussianBlur(4)), COL['halo'], 0.55)
    grad = Image.new('RGBA', (W, H)); gp = grad.load()
    for y in range(H):
        t = max(0.0, min(1.0, (y - (EY - 60)) / 130))
        col = tuple(int(COL['top'][i] + (COL['bottom'][i] - COL['top'][i]) * t) for i in range(3))
        for x in range(W): gp[x, y] = col + (255,)
    scan = Image.new('L', (W, H), 255); sp = scan.load()
    for y in range(0, H, 3):
        for x in range(W): sp[x, y] = 205
    grad.putalpha(ImageChops.multiply(m['light'], scan)); out.alpha_composite(grad)
    lay(m['iris'], COL['iris'], 0.9)
    lay(m['pink'], COL['pink'], 0.85)
    lay(m['tear'], COL['tear'], 0.95)
    lay(m['dark'], COL['dark'], 1.0)
    lay(m['pupil'], COL['pupil'], 1.0)
    edge = ImageChops.subtract(m['light'], m['light'].filter(ImageFilter.MinFilter(3)))
    lay(edge, (255, 255, 255), 0.3)
    lay(m['white'], (255, 255, 255), 0.95)
    return out

def face(name):
    return compose(build(name))

if __name__ == '__main__':
    os.makedirs(sys.argv[1], exist_ok=True)
    for n in F.FACES:
        f = face(n); bg = Image.new('RGBA', (W, H), (14, 8, 22, 255)); bg.alpha_composite(f); bg.save(os.path.join(sys.argv[1], n + '.png'))
