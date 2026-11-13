# 3D-Figur: GLB zu Sprite-Sheet

Die Desktop-Figur (`windows/TecMon.cs`) hat keinen 3D-Renderer (nur .NET
Framework 4, C# 5). Das 3D-Modell wird darum vorab gerendert: 72 Drehwinkel (5°)
plus 19 LED-Ausdrücke, zusammen in `tools/cs2-companion/public/desktop-bot-3d.png`.
Das Bild wird als Ressource `TecMonBot3D` in die EXE eingebaut.

Das Modell (`base.glb`, ~26 MB) und seine Texturen liegen nicht im Repository.

## Neu rendern

Voraussetzungen: Node.js mit Playwright/Chromium, Python 3 mit Pillow, `three`.

```bash
export TECMON_3D=/pfad/zu/tecmon-3d        # base.glb, texture_*.png
export TECMON_3D_WORK=$(mktemp -d)         # Arbeitsordner, wird ausgeliefert
npm i --prefix "$TECMON_3D_WORK" three@0.170.0
cp index.html "$TECMON_3D_WORK/"
ln -s "$TECMON_3D_WORK/node_modules/three" "$TECMON_3D_WORK/three"
for t in diffuse emissive normal metallic roughness; do cp "$TECMON_3D/texture_$t.png" "$TECMON_3D_WORK/$t.png"; done
cp "$TECMON_3D/base.glb" "$TECMON_3D_WORK/"
python3 bake.py $(python3 -c "import faces;print(*faces.FACES)")   # Gesicht überdecken, LED-Gesichter einsetzen
mkdir -p "$TECMON_3D_WORK/frames"
node render.cjs "$TECMON_3D_WORK/frames"
python3 sheet.py "$TECMON_3D_WORK/frames" ../../tools/cs2-companion/public/desktop-bot-3d.png
```

- `faces.py`: Formen der Gesichter (Augen, Mund, Ausdrücke) und der alte
  LED-Punktstil.
- `faces_expr.py`: Standardstil seit 0.22.1, gezeichnete Holo-Gesichter mit
  Iris, Pupille, Glanzlichtern, Augenbrauen, Wangen, Tränen, Herzen und
  ausdrucksstarken Mündern. `python3 faces_expr.py <ordner>` speichert sie zur
  Ansicht.
- `faces_holo.py`: schlichtere Holo-Augen mit Verlauf, Glanzpunkt und
  Scanlines. `TECMON_FACES=expr|holo|gold|led` wählt den Stil für
  `bake.py`; `python3 faces_holo.py <ordner> [holo|gold]` speichert die
  Gesichter zur Ansicht.
  `python3 faces.py <ordner>` speichert sie zur Ansicht als PNG.
- `bake.py`: deckt das alte Gesicht im UV-Atlas ab (Visier ohne Gold) und
  setzt je Ausdruck eine Diffuse- und Emissive-Textur ein; die Normal-Map
  wird dort geglättet, damit keine alten Augen durchscheinen.
- Neue Ausdrücke oder eine andere Zellgröße brauchen eine Anpassung der
  Konstanten in `DesktopPet` (`TecMon.cs`).
