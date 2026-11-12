# LED-Gesichter als Punktmatrix: schlichter Visier-Look (Balken-Augen, Equalizer-Mund).
import os, sys, math
from PIL import Image, ImageDraw, ImageFilter
W, H = 530, 310
P, R = 11, 3.9          # Raster und LED-Radius
EX, EY, MY = 100, 128, 216
def caps(dx, dy, w, h):  # Kapsel (abgerundeter Balken)
    ax = max(0, abs(dx) - (w - h)); return (ax / h) ** 2 + (dy / h) ** 2 <= 1
def eye(kind, dx, dy, side):
    if kind == 'open':  return caps(dx, dy, 43, 27) and dy >= -27 + side * dx * 0.18
    if kind == 'blink': return caps(dx, dy, 46, 5)
    if kind == 'happy': return abs(dx) <= 44 and abs(dy - (0.011 * dx * dx - 12)) <= 9
    if kind == 'focus': return caps(dx, dy, 43, 22) and dy >= -6 + side * dx * 0.28
    if kind == 'scan':  return abs(dx) <= 12 and abs(dy) <= 12
    return False
LEVELS = {'talkA': [10, 22, 34, 22, 10], 'talkB': [18, 10, 24, 10, 18]}
def mouth(kind, dx, dy):
    if kind in LEVELS:
        i = round(dx / 22) + 2
        if 0 <= i < 5 and abs(dx - (i - 2) * 22) <= 6: return abs(dy) <= LEVELS[kind][i]
        return False
    if kind == 'line': return abs(dy) <= 3 and abs(dx) <= 34
    return False
FACES = {'idle': ('open', ''), 'blink': ('blink', ''), 'happy': ('happy', ''), 'talkA': ('open', 'talkA'),
         'talkB': ('open', 'talkB'), 'focus': ('focus', ''), 'busy': ('scan', 'line')}
def face(name):
    e, m = FACES[name]
    lit = Image.new('L', (W, H), 0); dim = Image.new('L', (W, H), 0)
    dl, dd = ImageDraw.Draw(lit), ImageDraw.Draw(dim)
    x0 = (W // 2) % P; y0 = EY % P
    for gy in range(y0, H, P):
        for gx in range(x0, W, P):
            on = eye(e, gx - (W / 2 - EX), gy - EY, 1) or eye(e, gx - (W / 2 + EX), gy - EY, -1) or (m and mouth(m, gx - W / 2, gy - MY))
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
