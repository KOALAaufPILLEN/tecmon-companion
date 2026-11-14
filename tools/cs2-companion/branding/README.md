# TecMon Branding

Aktuell: **v2**, SHA256 `60a13b041dad4d990b38f048c2c9963269b1945d22d594613b49602719753eb2`.

`source/cyber-hud.svg` und `source/cyber-stinger.svg` sind eigene TecMon-Vektorgrafiken unter der Repository-Lizenz. Reproduktion mit Sharp 0.35.5: `node scripts/build-cyber-branding.mjs dist`. Nur der Build benötigt Sharp. Die PNGs werden zusammen mit Logo, Barlow-Schrift und OFL als geprüftes Release-Paket geladen.

## Ursprüngliches Paket v1

Bytegleiche Quelle und Testfixture des Release-Assets. Der Programm-Updater bündelt dieses Paket nicht; die Laufzeit lädt es bei Bedarf über eine feste URL und prüft feste SHA256-Werte.

Paket-SHA256: `aebe71cd08594e66cd2b6afea6da70859857f2ce83201295f152bcaf8c9ab155`

Quellen und Reproduktion: `scripts/build-branding-pack.mjs`.

Barlow Condensed Bold: Copyright 2017 The Barlow Project Authors, SIL Open Font License 1.1. OFL.txt ist im Paket sowie neben dieser Datei enthalten. Markenrechte am TecMon-Logo werden durch die Quellcode-Lizenz nicht übertragen.

## Video-Paket Motion v1 (ab 0.23.0)

`TecMon-Motion-v1.json` enthält `intro.mp4` (6,50 s), `stinger.mp4` (2,83 s) und
`outro.mp4` (5,50 s), alle 1280×720, 24 fps, mit Ton. Paket-SHA256:
`64e38c19eeca53585e9986e6fdd03a6a0e93cd21d672c8a96e41bd60c126c5e6`. Der
Release-Workflow lädt es als Release-Asset hoch; die Laufzeit holt es über
`MOTION_URL` und prüft `MOTION_SHA256` und `MOTION_FILES`.

Die Clips wurden im Auftrag des Projektinhabers mit Google Gemini Omni Flash
(`gemini-omni-1.1-flash`) erzeugt, mit TecMon-Figur und TecMon-Logo aus dessen
eigenem Intro als Bildvorlage. Schnitt mit FFmpeg: Intro 0,6–3,0 s normal,
3,0–4,9 s doppelt so schnell (Logo steht still), 4,9–8,04 s normal, am Ende 0,2 s
Abblende. Szenenwechsel 0,5–3,3 s; der Spielername erscheint im Partikelsturm
(1,5–2,6 s). Outro 0,0–5,5 s mit 0,6 s Ton-Abblende; Website und Kanal
blendet der Companion ab 3,7 s unter dem Logo ein. Alle mit
`libx264 -crf 20 -preset veryslow`, AAC 128 kbit/s, 48 kHz, ohne Metadaten.
