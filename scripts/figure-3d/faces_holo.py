# Holo-Gesichter: glatte, leuchtende Formen statt LED-Punkten.
# Nutzt dieselben Formen wie faces.py (eye/mouth), nur fein abgetastet,
# mit Verlauf, Glanzpunkt, weichem Leuchten und feinen Holo-Scanlines.
# Stil "holo" (lila, Standard) oder "gold" (goldener Kern, lila Rand).
import os, sys, math
from PIL import Image, ImageFilter, ImageChops
import faces as F

W, H = F.W, F.H
S = 3  # Überabtastung für glatte Kanten

def mask(fn, boxes):
    m = Image.new('L', (W * S, H * S), 0); px = m.load()
    for (x0, y0, x1, y1) in boxes:
        for y in range(max(0, y0 * S), min(H * S, y1 * S)):
            for x in range(max(0, x0 * S), min(W * S, x1 * S)):
                if fn(x / S, y / S): px[x, y] = 255
    return m.resize((W, H), Image.LANCZOS)

def vgrad(top, bottom):
    g = Image.new('RGBA', (W, H)); p = g.load()
    for y in range(H):
        t = max(0.0, min(1.0, (y - (F.EY - 55)) / 120))
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(W): p[x, y] = c + (255,)
    return g

STYLES = {
    'holo': dict(top=(250, 245, 255), bottom=(176, 140, 255), glow=(139, 92, 246), halo=(196, 170, 255)),
    'gold': dict(top=(255, 246, 214), bottom=(245, 200, 90), glow=(139, 92, 246), halo=(255, 220, 140)),
}
SPARKLE = {'open', 'focus', 'angry', 'sad', 'wink', 'confused'}

def face(name, style='holo'):
    e, m = F.FACES[name]; st = STYLES[style]
    lx, rx = W / 2 - F.EX, W / 2 + F.EX
    eyes = mask(lambda x, y: F.eye(e, x - lx, y - F.EY, -1) or F.eye(e, x - rx, y - F.EY, 1),
                [(int(lx) - 75, F.EY - 70, int(lx) + 75, F.EY + 70), (int(rx) - 75, F.EY - 70, int(rx) + 75, F.EY + 70)])
    shape = eyes
    if m:
        mo = mask(lambda x, y: F.mouth(m, x - W / 2, y - F.MY), [(int(W / 2) - 90, F.MY - 60, int(W / 2) + 210, F.MY + 50), (0, 0, W, 40)] if m == 'zz' else [(int(W / 2) - 90, F.MY - 60, int(W / 2) + 90, F.MY + 50)])
        shape = ImageChops.lighter(eyes, mo)
    # Glanzpunkt oben links in offenen Augen
    if e in SPARKLE:
        sp = Image.new('L', (W, H), 0); p = sp.load()
        for side, cx in ((-1, lx), (1, rx)):
            if e == 'wink' and side > 0: continue
            if e == 'confused' and side > 0: continue
            for y in range(H):
                for x in range(int(cx) - 30, int(cx) + 30):
                    d = math.hypot((x - (cx - 9)) / 8, (y - (F.EY - 22)) / 11)
                    if d <= 1: p[x, y] = 255
        sp = ImageChops.multiply(sp, eyes)
    else:
        sp = None
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    def lay(msk, col, alpha):
        layer = Image.new('RGBA', (W, H), col + (0,)); layer.putalpha(msk.point(lambda v: int(v * alpha))); out.alpha_composite(layer)
    lay(shape.filter(ImageFilter.GaussianBlur(16)), st['glow'], 0.9)
    lay(shape.filter(ImageFilter.GaussianBlur(5)), st['halo'], 0.7)
    body = vgrad(st['top'], st['bottom'])
    # Holo-Scanlines: jede dritte Zeile etwas dunkler
    scan = Image.new('L', (W, H), 255); sp2 = scan.load()
    for y in range(0, H, 3):
        for x in range(W): sp2[x, y] = 190
    body.putalpha(ImageChops.multiply(shape, scan)); out.alpha_composite(body)
    # dünne helle Kante oben für Tiefe
    edge = ImageChops.subtract(shape, shape.filter(ImageFilter.MinFilter(3)))
    lay(edge, (255, 255, 255), 0.35)
    if sp is not None: lay(sp.filter(ImageFilter.GaussianBlur(0.6)), (255, 255, 255), 0.95)
    return out

if __name__ == '__main__':
    style = sys.argv[2] if len(sys.argv) > 2 else 'holo'
    os.makedirs(sys.argv[1], exist_ok=True)
    for n in F.FACES:
        f = face(n, style); bg = Image.new('RGBA', (W, H), (14, 8, 22, 255)); bg.alpha_composite(f); bg.save(os.path.join(sys.argv[1], n + '.png'))
