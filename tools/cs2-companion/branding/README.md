# TecMon Branding

Aktuell: **v2**, SHA256 `60a13b041dad4d990b38f048c2c9963269b1945d22d594613b49602719753eb2`.

`source/cyber-hud.svg` und `source/cyber-stinger.svg` sind eigene TecMon-Vektorgrafiken unter der Repository-Lizenz. Reproduktion mit Sharp 0.35.5: `node scripts/build-cyber-branding.mjs dist`. Nur der Build benötigt Sharp. Die PNGs werden zusammen mit Logo, Barlow-Schrift und OFL als geprüftes Release-Paket geladen.

## Ursprüngliches Paket v1

Bytegleiche Quelle und Testfixture des Release-Assets. Der Programm-Updater bündelt dieses Paket nicht; die Laufzeit lädt es bei Bedarf über eine feste URL und prüft feste SHA256-Werte.

Paket-SHA256: `aebe71cd08594e66cd2b6afea6da70859857f2ce83201295f152bcaf8c9ab155`

Quellen und Reproduktion: `scripts/build-branding-pack.mjs`.

Barlow Condensed Bold: Copyright 2017 The Barlow Project Authors, SIL Open Font License 1.1. OFL.txt ist im Paket sowie neben dieser Datei enthalten. Markenrechte am TecMon-Logo werden durch die Quellcode-Lizenz nicht übertragen.
