# LED-Gesichter als Punktmatrix: hohe, abgerundete Augen und ein kleiner ovaler Mund.
# Alles ist spiegelgleich, damit beide Augen exakt auf einer Höhe sitzen.
import os, sys, math
from PIL import Image, ImageDraw, ImageFilter
W, H = 530, 310
P, R = 9, 3.4          # Raster und LED-Radius
EX, EY, MY = 99, 117, 198   # Augen- und Mundmitte liegen genau auf dem Raster
def pill(dx, dy, w, h):  # stehende Kapsel: Breite w, Höhe h (Halbachsen)
    ay = max(0, abs(dy) - (h - w)); return (dx / w) ** 2 + (ay / w) ** 2 <= 1.02
def ellipse(dx, dy, w, h): return (dx / w) ** 2 + (dy / h) ** 2 <= 1.02
def eye(kind, dx, dy):
    if kind == 'open':  return pill(dx, dy, 27, 48)
    if kind == 'blink': return abs(dy) <= 4 and abs(dx) <= 32
    if kind == 'happy': return abs(math.hypot(dx, dy - 20) - 30) <= 8 and dy <= 16
    if kind == 'focus': return pill(dx, dy - 12, 27, 30)
    if kind == 'scan':  return abs(dx) <= 14 and abs(dy) <= 14
    return False
MOUTHS = {'talkA': (24, 17), 'talkB': (16, 8)}
def mouth(kind, dx, dy):
    if kind in MOUTHS: return ellipse(dx, dy, *MOUTHS[kind])
    if kind == 'dots': return abs(dy) <= 4 and abs(dx) <= 28 and round(dx / 9) % 3 == 0
    return False
FACES = {'idle': ('open', ''), 'blink': ('blink', ''), 'happy': ('happy', ''), 'talkA': ('open', 'talkA'),
         'talkB': ('open', 'talkB'), 'focus': ('focus', ''), 'busy': ('scan', 'dots')}
def face(name):
    e, m = FACES[name]
    lit = Image.new('L', (W, H), 0); dim = Image.new('L', (W, H), 0)
    dl, dd = ImageDraw.Draw(lit), ImageDraw.Draw(dim)
    x0 = (W // 2) % P; y0 = EY % P
    for gy in range(y0, H, P):
        for gx in range(x0, W, P):
            on = eye(e, gx - (W / 2 - EX), gy - EY) or eye(e, gx - (W / 2 + EX), gy - EY) or (m and mouth(m, gx - W / 2, gy - MY))
            (dl if on else dd).ellipse((gx - R, gy - R, gx + R, gy + R), fill=255)
    glow = lit.filter(ImageFilter.GaussianBlur(10)); halo = lit.filter(ImageFilter.GaussianBlur(3))
    rgba = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    def lay(mask, col, alpha):
        layer = Image.new('RGBA', (W, H), col + (0,)); layer.putalpha(mask.point(lambda v: int(v * alpha))); rgba.alpha_composite(layer)
    lay(dim, (90, 60, 140), 0.16); lay(glow, (150, 90, 255), 1.0); lay(halo, (200, 160, 255), 0.8); lay(lit, (246, 236, 255), 1.0)
    return rgba
if __name__ == '__main__':
    for n in FACES:
        f = face(n); bg = Image.new('RGBA', (W, H), (14, 8, 22, 255)); bg.alpha_composite(f); bg.save(os.path.join(sys.argv[1], n + '.png'))
