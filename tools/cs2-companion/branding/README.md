# TecMon Branding

Aktuell: **v2**, SHA256 `60a13b041dad4d990b38f048c2c9963269b1945d22d594613b49602719753eb2`.

`source/cyber-hud.svg` und `source/cyber-stinger.svg` sind eigene TecMon-Vektorgrafiken unter der Repository-Lizenz. Reproduktion mit Sharp 0.35.5: `node scripts/build-cyber-branding.mjs dist`. Nur der Build benötigt Sharp. Die PNGs werden zusammen mit Logo, Barlow-Schrift und OFL als geprüftes Release-Paket geladen.

## Ursprüngliches Paket v1

Bytegleiche Quelle und Testfixture des Release-Assets. Der Programm-Updater bündelt dieses Paket nicht; die Laufzeit lädt es bei Bedarf über eine feste URL und prüft feste SHA256-Werte.

Paket-SHA256: `aebe71cd08594e66cd2b6afea6da70859857f2ce83201295f152bcaf8c9ab155`

Quellen und Reproduktion: `scripts/build-branding-pack.mjs`.

Barlow Condensed Bold: Copyright 2017 The Barlow Project Authors, SIL Open Font License 1.1. OFL.txt ist im Paket sowie neben dieser Datei enthalten. Markenrechte am TecMon-Logo werden durch die Quellcode-Lizenz nicht übertragen.

## Video-Paket Motion v1 (ab 0.23.0)

`TecMon-Motion-v1.json` enthält `intro.mp4` (5,48 s, 1280×720, 60 fps) und
`stinger.mp4` (2,13 s, 1280×720, 24 fps), beide mit Ton. Paket-SHA256:
`e88136364b4e120f723ca4fff5d61e47cd11e527548b8aaaabf3f4c3e950b476`. Der
Release-Workflow lädt es als Release-Asset hoch; die Laufzeit holt es über
`MOTION_URL` und prüft `MOTION_SHA256` und `MOTION_FILES`.

Quelle sind vom Projektinhaber gelieferte TecMon-Videos. Schnitt mit FFmpeg:
Intro aus `TecmonIntro.mp4` die Bereiche 0,8–3,0 s und 4,4–7,8 s mit 0,12 s
Überblendung, am Ende 0,18 s Abblende. Szenenwechsel aus `szenenwechsel.mp4`
der Bereich 0,12–2,22 s. Beide mit `libx264 -crf 20 -preset veryslow`, AAC
128 kbit/s, 48 kHz, ohne Metadaten.
