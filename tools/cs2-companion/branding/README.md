# TecMon Branding

Aktuell: **v2**, SHA256 `60a13b041dad4d990b38f048c2c9963269b1945d22d594613b49602719753eb2`.

`source/cyber-hud.svg` und `source/cyber-stinger.svg` sind eigene TecMon-Vektorgrafiken unter der Repository-Lizenz. Reproduktion mit Sharp 0.35.5: `node scripts/build-cyber-branding.mjs dist`. Nur der Build benötigt Sharp. Die PNGs werden zusammen mit Logo, Barlow-Schrift und OFL als geprüftes Release-Paket geladen.

## Ursprüngliches Paket v1

Bytegleiche Quelle und Testfixture des Release-Assets. Der Programm-Updater bündelt dieses Paket nicht; die Laufzeit lädt es bei Bedarf über eine feste URL und prüft feste SHA256-Werte.

Paket-SHA256: `aebe71cd08594e66cd2b6afea6da70859857f2ce83201295f152bcaf8c9ab155`

Quellen und Reproduktion: `scripts/build-branding-pack.mjs`.

Barlow Condensed Bold: Copyright 2017 The Barlow Project Authors, SIL Open Font License 1.1. OFL.txt ist im Paket sowie neben dieser Datei enthalten. Markenrechte am TecMon-Logo werden durch die Quellcode-Lizenz nicht übertragen.

## Video-Paket Motion v2 (ab 0.24.0)

`TecMon-Motion-v2.json` (9,5 MB, Limit 16 MB, `version: 2`). Paket-SHA256:
`5ce1817e13a61ba26df41a105734d79693058b01d926a3f0c0ba9ac7e7cac2ba`. Enthält die
Intros und Outros aus v1 (unverändert, gleiche Prüfsummen) und zwei neue Clips
für beide Stile, 1280×720, 30 fps, mit Ton:

| Clip | Länge | Inhalt |
| --- | --- | --- |
| `title.mp4` | 3,8 s | Esport-Titelbild vor Grün (#00FF00): Paneele und Banner bis 0,9 s, Text 0,95–3,0 s, ab 3,0 s verlässt das Bild als schräger Streifen nach links, lila und goldene Streifen folgen (frei bei 3,66 s) |
| `switch.mp4` | 2,8 s | Esport-Spielerwechsel vor Grün: drei schräge Paneele, deckend etwa 0,65–2,1 s, Wechsel bei 1,4 s |

Hintergrund ist das Sternennetz der Webseite (`components/fx/CyberBackground.tsx`
im Repo `tecmon`): driftende Knoten, die sich in der Nähe violett verbinden,
goldene Knoten und ein wandernder Lichtpunkt mit goldenen Leitungen.

Beide Clips sind programmiert (keine KI): `source/esport-motion.html` zeichnet sie
auf einem Canvas, `source/esport-render.cjs` speichert sie Bild für Bild
(`node esport-render.cjs title 3.8 30 <Ordner>` bzw. `stinger 2.8 30`, `logo.webp`
neben der HTML-Datei). Ton aus FFmpeg-Generatoren (Rauschen und Tiefton-Schlag).
Kodierung `libx264 -crf 18 -preset veryslow`, AAC 128 kbit/s. Den Text im Banner
schreibt der Companion selbst. Freigestellt wird per `colorkey` (RGB-Abstand) mit
herausgerechnetem Grün; Grün bleibt danach höchstens so stark wie Rot oder Blau,
damit an unscharfen Kanten kein grüner Rand stehen bleibt. Vom Titelbild zur
ersten Szene wird nur 0,12 s überblendet, damit der Streifen-Abgang nicht durchscheint.

## Video-Paket Motion v1 (0.23.x)


`TecMon-Motion-v1.json` (11,5 MB, Limit 16 MB) enthält zwei wählbare Stile, alle
Clips 1280×720, 24 fps, mit Ton. Paket-SHA256:
`df4ff27ac9661bc9c9837ecc8d4e9e1c8ddc2fb0f1f4abf39a549d484ae27207`. Der
Release-Workflow lädt es als Release-Asset hoch; die Laufzeit holt es über
`MOTION_URL` und prüft `MOTION_SHA256` und `MOTION_FILES`.

| Stil | Intro | Spielerwechsel (Greenscreen) | Outro |
| --- | --- | --- | --- |
| `a` Neon-Raster | `intro.mp4` 6,50 s | `stinger.mp4` 3,38 s | `outro.mp4` 5,50 s |
| `b` Hologramm | `intro-b.mp4` 7,00 s | `stinger-b.mp4` 3,33 s | `outro-b.mp4` 5,50 s |

Die Clips wurden im Auftrag des Projektinhabers mit Google Gemini Omni Flash
(`gemini-omni-1.1-flash`) erzeugt, mit TecMon-Figur und TecMon-Logo aus dessen
eigenem Intro als Bildvorlage. Schnitte mit FFmpeg:

- Intro A: 0,6–3,0 s normal, 3,0–4,9 s doppelt so schnell, 4,9–8,04 s normal,
  0,2 s Abblende. Intro B: 0,0–7,0 s.
- Spielerwechsel vor Grün (#0CA218): A 0,3–3,6 s, B 0,2–3,5 s. Der Companion
  stellt sie frei und legt sie über das letzte bzw. erste Bild der Szenen; unter
  dem deckenden Moment (`cut` in `MOTION_STYLES`) wechselt das Gameplay weich.
  Bis dahin hartes Freistellen, danach weiches mit herausgerechnetem Grün.
- Outro A: 0,0–5,5 s. Outro B: 0,0–5,5 s, beginnt mit dem letzten Bild von
  Intro B. Website und Kanal blendet der Companion ein.
- 0.23.1 blendete den Titel über die erste Szene; ab 0.24.0 ersetzt durch das
  Esport-Titelbild, die Spielerwechsel `stinger*.mp4` durch `switch.mp4`.

Alle mit `libx264 -crf 20/21 -preset veryslow`, AAC 128 kbit/s, 48 kHz, ohne Metadaten.
