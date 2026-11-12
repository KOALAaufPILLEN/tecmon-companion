# LED-Gesichter als Punktmatrix: hohe, abgerundete Augen und ein kleiner Mund.
# Augen liegen spiegelgleich auf einer Höhe; side = -1 linkes, +1 rechtes Auge.
import os, sys, math
from PIL import Image, ImageDraw, ImageFilter
W, H = 530, 310
P, R = 9, 3.4           # Raster und LED-Radius
EX, EY, MY = 99, 117, 198   # Augen- und Mundmitte liegen genau auf dem Raster
def pill(dx, dy, w, h):  # stehende Kapsel: Breite w, Höhe h (Halbachsen)
    ay = max(0, abs(dy) - (h - w)); return (dx / w) ** 2 + (ay / w) ** 2 <= 1.02
def ellipse(dx, dy, w, h): return (dx / w) ** 2 + (dy / h) ** 2 <= 1.02
def ring(dx, dy, r, t): return abs(math.hypot(dx, dy) - r) <= t
def arc_up(dx, dy, r=30, t=8):   # Bogen wie ^ (geschlossenes, lachendes Auge)
    return abs(math.hypot(dx, dy - r * 0.67) - r) <= t and dy <= r * 0.55
def seg(dx, dy, x1, y1, x2, y2, t):  # Linie von (x1,y1) nach (x2,y2)
    vx, vy = x2 - x1, y2 - y1; k = max(0, min(1, ((dx - x1) * vx + (dy - y1) * vy) / (vx * vx + vy * vy)))
    return math.hypot(dx - x1 - k * vx, dy - y1 - k * vy) <= t
def heart(dx, dy, s):
    x, y = dx / s, -dy / s + 0.15; return (x * x + y * y - 1) ** 3 - x * x * y ** 3 <= 0
def star(dx, dy, r):
    a = math.atan2(dy, dx) + math.pi / 2; k = (a % (2 * math.pi / 5)) / (2 * math.pi / 5)
    edge = r * (0.45 + 0.55 * abs(1 - 2 * k)); return math.hypot(dx, dy) <= edge
def eye(kind, dx, dy, side):
    if kind == 'open':     return pill(dx, dy, 27, 48)
    if kind == 'blink':    return abs(dy) <= 4 and abs(dx) <= 32
    if kind == 'happy':    return arc_up(dx, dy)
    if kind == 'focus':    return pill(dx, dy - 12, 27, 30)
    if kind == 'scan':     return abs(dx) <= 14 and abs(dy) <= 14
    if kind == 'wink':     return arc_up(dx, dy) if side > 0 else pill(dx, dy, 27, 48)
    if kind == 'ring':     return ring(dx, dy, 30, 7)
    if kind == 'cross':    return seg(dx, dy, -26, -26, 26, 26, 6) or seg(dx, dy, -26, 26, 26, -26, 6)
    if kind == 'squeeze':  # > <
        return seg(dx, dy, -24 * side, -24, 20 * side, 0, 6) or seg(dx, dy, 20 * side, 0, -24 * side, 24, 6)
    if kind == 'heart':    return heart(dx, dy, 34)
    if kind == 'angry':    return pill(dx, dy + 4, 27, 40) and dy >= -24 - side * dx * 0.7
    if kind == 'sleepy':   return abs(dy - 12) <= 4 and abs(dx) <= 30
    if kind == 'sad':      return pill(dx, dy, 27, 44) and dy >= -10 + side * dx * 0.5
    if kind == 'shades':   return (-36 <= dx <= 36 and -14 <= dy <= 22 and not (dy > 10 and abs(dx) > 26)) or (dy <= -6 and dy >= -12 and -side * dx >= 0 and -side * dx <= 62)
    if kind == 'star':     return star(dx, dy, 40)
    if kind == 'confused': return pill(dx, dy, 27, 48) if side < 0 else (abs(dy + 20) <= 4 and abs(dx) <= 30)
    return False
def mouth(kind, dx, dy):
    if kind == 'talkA':  return ellipse(dx, dy, 24, 17)
    if kind == 'talkB':  return ellipse(dx, dy, 16, 8)
    if kind == 'dots':   return abs(dy) <= 4 and abs(dx) <= 28 and round(dx / 9) % 3 == 0
    if kind == 'smile':  return abs(math.hypot(dx, dy + 40) - 48) <= 5 and dy >= -10
    if kind == 'frown':  return abs(math.hypot(dx, dy - 40) - 48) <= 5 and dy <= 10
    if kind == 'o':      return ring(dx, dy, 17, 5)
    if kind == 'wave':   return abs(dy - 7 * math.sin(dx / 9)) <= 4 and abs(dx) <= 36
    if kind == 'grin':   return dy >= -6 and ellipse(dx, dy + 6, 34, 26)
    if kind == 'kiss':   return ring(dx + 4, dy, 10, 4) or heart(dx - 48, dy + 18, 13)
    if kind == 'tongue': return mouth('smile', dx, dy) or (dy >= 4 and ellipse(dx - 6, dy - 8, 13, 13))
    if kind == 'line':   return abs(dy) <= 3 and abs(dx) <= 18
    if kind == 'smirk':  return seg(dx, dy, -24, 4, 20, -2, 4) or seg(dx, dy, 20, -2, 30, -8, 4)
    if kind == 'zz':     return seg(dx, dy, 140, -186, 176, -186, 4) or seg(dx, dy, 176, -186, 140, -150, 4) or seg(dx, dy, 140, -150, 176, -150, 4)
    return False
# Reihenfolge = Bildnummer im Sprite-Sheet ab Zelle 72 (idle ist Winkel 0°). TecMon.cs muss dazu passen.
FACES = {'idle': ('open', ''), 'blink': ('blink', ''), 'happy': ('happy', 'smile'), 'talkA': ('open', 'talkA'),
         'talkB': ('open', 'talkB'), 'focus': ('focus', ''), 'busy': ('scan', 'dots'),
         'wink': ('wink', 'smile'), 'surprised': ('ring', 'o'), 'dizzy': ('cross', 'wave'), 'laugh': ('squeeze', 'grin'),
         'love': ('heart', 'smile'), 'kiss': ('happy', 'kiss'), 'angry': ('angry', 'frown'), 'sleepy': ('sleepy', 'zz'),
         'tongue': ('happy', 'tongue'), 'sad': ('sad', 'frown'), 'cool': ('shades', 'smirk'), 'star': ('star', 'smile'),
         'confused': ('confused', 'wave')}
def face(name):
    e, m = FACES[name]
    lit = Image.new('L', (W, H), 0); dim = Image.new('L', (W, H), 0)
    dl, dd = ImageDraw.Draw(lit), ImageDraw.Draw(dim)
    x0 = (W // 2) % P; y0 = EY % P
    for gy in range(y0, H, P):
        for gx in range(x0, W, P):
            on = eye(e, gx - (W / 2 - EX), gy - EY, -1) or eye(e, gx - (W / 2 + EX), gy - EY, 1) or (m and mouth(m, gx - W / 2, gy - MY))
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
