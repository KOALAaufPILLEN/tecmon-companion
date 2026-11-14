# TecMon Branding

Aktuell: **v2**, SHA256 `60a13b041dad4d990b38f048c2c9963269b1945d22d594613b49602719753eb2`.

`source/cyber-hud.svg` und `source/cyber-stinger.svg` sind eigene TecMon-Vektorgrafiken unter der Repository-Lizenz. Reproduktion mit Sharp 0.35.5: `node scripts/build-cyber-branding.mjs dist`. Nur der Build benötigt Sharp. Die PNGs werden zusammen mit Logo, Barlow-Schrift und OFL als geprüftes Release-Paket geladen.

## Ursprüngliches Paket v1

Bytegleiche Quelle und Testfixture des Release-Assets. Der Programm-Updater bündelt dieses Paket nicht; die Laufzeit lädt es bei Bedarf über eine feste URL und prüft feste SHA256-Werte.

Paket-SHA256: `aebe71cd08594e66cd2b6afea6da70859857f2ce83201295f152bcaf8c9ab155`

Quellen und Reproduktion: `scripts/build-branding-pack.mjs`.

Barlow Condensed Bold: Copyright 2017 The Barlow Project Authors, SIL Open Font License 1.1. OFL.txt ist im Paket sowie neben dieser Datei enthalten. Markenrechte am TecMon-Logo werden durch die Quellcode-Lizenz nicht übertragen.

## Video-Paket Motion v1 (ab 0.23.0)

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
- Keine eigene Titelkarte: Titel, Spieler, Untertitel und Map werden über die
  ersten Sekunden der ersten Szene geblendet (ab 0.23.1).

Alle mit `libx264 -crf 20/21 -preset veryslow`, AAC 128 kbit/s, 48 kHz, ohne Metadaten.
