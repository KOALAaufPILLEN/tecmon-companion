# Einzelbilder zum Sprite-Sheet der Figur zusammensetzen (public/desktop-bot-3d.png).
# Reihenfolge: 0-35 Drehwinkel 0°..350° (10°-Schritte, 90° = Gesicht nach rechts),
# 36 blinzeln, 37 lächeln, 38 sprechen A, 39 sprechen B, 40 konzentriert, 41 Aufnahme.
# Zelle 200x130, 7 Spalten. TecMon.cs (CellW, CellH, Cols) muss dazu passen.
import sys
from PIL import Image
frames, out = sys.argv[1], sys.argv[2]
CROP = (6, 70, 378, 312); W, H, COLS = 200, 130, 7
sheet = Image.new('RGBA', (COLS * W, 6 * H), (0, 0, 0, 0))
for i in range(42):
    f = Image.open(f'{frames}/{i:02d}.png').crop(CROP).resize((W, H), Image.LANCZOS)
    sheet.paste(f, ((i % COLS) * W, (i // COLS) * H))
sheet.save(out, optimize=True)
