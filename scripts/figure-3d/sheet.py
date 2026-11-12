# Einzelbilder zum Sprite-Sheet der Figur zusammensetzen (public/desktop-bot-3d.png).
# Reihenfolge: 0-71 Drehwinkel 0°..355° (5°-Schritte, 90° = Gesicht nach rechts),
# ab 72 die Ausdrücke aus faces.py (FACES ohne idle, gleiche Reihenfolge).
# Zelle 200x130, 8 Spalten. TecMon.cs (CellW, CellH, Cols, Turns, Ausdrücke) muss dazu passen.
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image
frames, out = sys.argv[1], sys.argv[2]
import faces
CROP = (6, 70, 378, 312); W, H, COLS = 200, 130, 8
N = 72 + len(faces.FACES) - 1
sheet = Image.new('RGBA', (COLS * W, -(-N // COLS) * H), (0, 0, 0, 0))
for i in range(N):
    f = Image.open(f'{frames}/{i:02d}.png').crop(CROP).resize((W, H), Image.LANCZOS)
    sheet.paste(f, ((i % COLS) * W, (i // COLS) * H))
sheet.save(out, optimize=True)
