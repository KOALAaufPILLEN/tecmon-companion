# 3D-Figur: GLB zu Sprite-Sheet

Seit 0.44.0 zeichnet die Desktop-Figur (`windows/TecMon.cs`, Klasse `FigureModel`) das Modell
standardmäßig live („High process“, siehe unten „Echtzeit-Modell“). Für „Low process“ wird das
3D-Modell vorab gerendert: 72 Drehwinkel (5°)
plus 24 LED-Ausdrücke (seit 0.32.3 mit Animationsbildern `busy2`–`busy4`, `lookL`, `lookR`), zusammen in `tools/cs2-companion/public/desktop-bot-3d.png`.
Das Bild wird als Ressource `TecMonBot3D` in die EXE eingebaut.

Das Modell (`base.glb`, ~26 MB) und seine Texturen liegen nicht im Repository.

## Echtzeit-Modell (High process)

Nach `bake.py` (gleiche Umgebung wie oben) und mit [gltfpack](https://github.com/zeux/meshoptimizer)
(`npm i gltfpack@0.22.0`):

```bash
python3 model.py "$TECMON_3D_WORK/node_modules/.bin/gltfpack" ../../tools/cs2-companion/windows/desktop-bot-model.zip
```

`model.py` glättet das Visier wie `index.html`, vereinfacht auf etwa 4 % der Dreiecke
(`TECMON_MODEL_RATIO`), berechnet weiche Normalen und packt Gitter (`mesh.bin`), Texturen mit
Gesicht `idle` (1024², `TECMON_MODEL_TEX`), je Ausdruck den Visier-Ausschnitt (`face-*.png`) und
die Zeichen neben dem Kopf (`extra-*.png`, aus `extras.py`) in eine ZIP-Datei. Die EXE bekommt sie
als Ressource `TecMonModel`. Prüfen: `"TecMon Companion.exe" --desktop-preview-model <ordner>`
schreibt Vorschaubilder und die Zeit je Bild.

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
- `faces_robot.py`: Standardstil seit 0.32.2, ruhige Roboter-Augen (abgerundete
  Leuchtfelder, leicht gesenktes Lid, kein Iris-/Manga-Stil). Zeichenhilfen aus
  `faces_anime.py` (verworfener Manga-Entwurf). `python3 faces_robot.py <ordner>` zur Ansicht.
- `faces_expr.py`: Stil von 0.22.1 bis 0.32.1, kräftige Holo-Gesichter nach der
  Vorlage des Nutzers (Leuchtfeld-Augen, Herzen, Spiralen, Sonnenbrille,
  Tränen, Wangen). Der Platz `star` zeigt das Gesicht „shy“ der Vorlage.
- `extras.py`: Zeichen neben dem Kopf (Zz, !, ?, Herz, Funkeln, Wut-Zeichen);
  `sheet.py` legt sie flach über die Zellen der Ausdrücke. `python3 faces_expr.py <ordner>` speichert sie zur
  Ansicht.
- `faces_holo.py`: schlichtere Holo-Augen mit Verlauf, Glanzpunkt und
  Scanlines. `TECMON_FACES=robot|expr|holo|gold|led` wählt den Stil für
  `bake.py`; `python3 faces_holo.py <ordner> [holo|gold]` speichert die
  Gesichter zur Ansicht.
  `python3 faces.py <ordner>` speichert sie zur Ansicht als PNG.
- `bake.py`: deckt das alte Gesicht im UV-Atlas ab (Visier ohne Gold) und
  setzt je Ausdruck eine Diffuse- und Emissive-Textur ein; die Normal-Map
  wird dort geglättet, damit keine alten Augen durchscheinen.
- Neue Ausdrücke oder eine andere Zellgröße brauchen eine Anpassung der
  Konstanten in `DesktopPet` (`TecMon.cs`).
