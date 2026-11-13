# Zeichen neben dem Kopf (Zz, !, ?, Herz, Funkeln, Wut-Zeichen). Sie liegen
# außerhalb des Visiers und werden deshalb erst in sheet.py flach über die
# fertige Zelle (200x130) gelegt, nicht in die Textur gebacken.
import math
from PIL import Image, ImageDraw, ImageFilter, ImageChops

W, H, S = 200, 130, 6
LIGHT, PINK, GLOW = (244, 236, 255), (255, 130, 205), (139, 92, 246)

class Pen:
    def __init__(self):
        self.m = {k: Image.new('L', (W * S, H * S), 0) for k in ('light', 'pink')}
        self.d = {k: ImageDraw.Draw(v) for k, v in self.m.items()}
    def line(self, pts, width, layer='light'):
        self.d[layer].line([(x * S, y * S) for x, y in pts], fill=255, width=max(1, int(width * S)), joint='curve')
        for x, y in (pts[0], pts[-1]): self.dot(x, y, width / 2, layer)
    def dot(self, x, y, r, layer='light'): self.d[layer].ellipse([(x - r) * S, (y - r) * S, (x + r) * S, (y + r) * S], fill=255)
    def poly(self, pts, layer='light'): self.d[layer].polygon([(x * S, y * S) for x, y in pts], fill=255)
    def z(self, x, y, s, w=1.6): self.line([(x, y), (x + s, y), (x, y + s), (x + s, y + s)], w)
    def bang(self, x, y, lean=0.0):
        self.poly([(x - 2.2 + lean, y), (x + 2.2 + lean, y), (x + 1.0, y + 12), (x - 1.0, y + 12)]); self.dot(x, y + 16.5, 1.9)
    def spark(self, x, y, r):
        self.poly([(x + (r if i % 2 == 0 else r * 0.28) * math.cos(i * math.pi / 4 - math.pi / 2), y + (r if i % 2 == 0 else r * 0.28) * math.sin(i * math.pi / 4 - math.pi / 2)) for i in range(8)])
    def heart(self, x, y, s):
        self.poly([(x + 16 * math.sin(t) ** 3 * s / 17, y - (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) * s / 17) for t in [2 * math.pi * i / 48 for i in range(48)]], 'pink')
    def arc(self, cx, cy, r, a0, a1, width):
        self.line([(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / 16)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / 16))) for i in range(17)], width)

def draw(name):
    p = Pen()
    if name == 'blink': p.z(150, 10, 4, 1.3); p.z(157, 5, 5, 1.5); p.z(166, 1.5, 6, 1.7)
    elif name == 'sleepy': p.z(149, 20, 5, 1.5); p.z(155, 10, 7, 1.8); p.z(164, 1.5, 9, 2.1)
    elif name == 'busy':
        for x, y, r in ((148, 12, 1.6), (156, 7, 2.0), (165, 9, 2.4)): p.dot(x, y, r)
    elif name == 'wink': p.spark(157, 10, 6.5); p.spark(167, 4, 3.2); p.spark(148, 4, 2.6)
    elif name == 'surprised': p.bang(44, 2, -1.2); p.bang(156, 2, 1.2)
    elif name == 'dizzy': p.spark(42, 10, 4.5); p.spark(158, 8, 5.5); p.spark(168, 17, 3)
    elif name == 'love': p.heart(158, 9, 5); p.heart(167, 3, 3)
    elif name == 'kiss': p.heart(158, 9, 6.5)
    elif name == 'angry':
        for a in (0, 90, 180, 270): p.arc(158 + 9 * math.cos(math.radians(a + 45)), 11 + 9 * math.sin(math.radians(a + 45)), 5, a + 180 + 8, a + 270 - 8, 2.2)
    elif name == 'star': p.spark(157, 9, 6); p.spark(45, 8, 4)
    elif name == 'confused':
        p.arc(159, 7, 5.2, 180, 440, 2.3); p.line([(159 + 5.2 * math.cos(math.radians(80)), 7 + 5.2 * math.sin(math.radians(80))), (158.5, 16)], 2.3); p.dot(158.5, 21, 1.7)
    else: return None
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    m = {k: v.resize((W, H), Image.LANCZOS) for k, v in p.m.items()}
    def lay(msk, col, a=1.0):
        layer = Image.new('RGBA', (W, H), col + (0,)); layer.putalpha(msk.point(lambda v: int(min(255, v * a)))); out.alpha_composite(layer)
    both = ImageChops.lighter(m['light'], m['pink'])
    lay(both.filter(ImageFilter.GaussianBlur(2.2)), GLOW, 1.6)
    lay(m['light'], LIGHT); lay(m['pink'], PINK)
    return out
