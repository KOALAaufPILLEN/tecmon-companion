# TecMon Companion

Öffentlicher Quellcode des lokalen Windows-Aufnahmestudios für CS2-Demos. Der Companion importiert Highlight-Aufträge von [TecMon](https://tecmon.online), steuert CS Demo Manager / HLAE / FFmpeg auf dem eigenen PC und erzeugt MP4-Dateien mit der echten CS2-Darstellung.

Der Quellcode steht unter der MIT-Lizenz. Beiträge, Fehlerberichte und Sicherheitsprüfungen sind willkommen. Dieses Repository enthält ausschließlich den Companion und seine Build-Werkzeuge. Es hat eine neue Git-Historie; der private Website-Code und dessen Historie werden nicht veröffentlicht.

## Sicherheit und Daten

- Keine YouTube-/Google-OAuth-Secrets, Refresh-Tokens, Website-Umgebungsdateien oder persönlichen Installationsdaten werden mitgeliefert. Der Companion benötigt keinen Zugang zum TecMon-YouTube-Kanal.
- Er erzeugt zur Laufzeit lokale Zugangsdaten: ein frei gewähltes PostgreSQL-Administratorpasswort, ein separates generiertes Datenbankkennwort und ein zufälliges Sitzungstoken für die lokale API. Diese Werte sind **keine öffentlichen Repository-Dateien**.
- Datenbank und API binden an `127.0.0.1`. Die API prüft Host, Origin und Sitzungstoken. Ausgewählte Dateien bleiben unter den normalen Windows-Rechten zugänglich.
- Demos, Aufnahme und Kodierung laufen lokal. Veröffentlichung einer MP4 erfolgt separat über die Website. Start der Aufnahme erfordert eine ausdrückliche Bestätigung. Webseiten müssen vorher einmal im lokalen Companion freigegeben werden.

Details, Grenzen und Hinweise für Reviewer: [SECURITY.md](SECURITY.md). Offener Code und bestandene Tests ersetzen kein unabhängiges Sicherheitsaudit.

## Windows herunterladen

Im [aktuellen GitHub-Release](https://github.com/KOALAaufPILLEN/tecmon-companion/releases/latest) gibt es zwei getrennte EXE-Dateien:

- **TecMon-Companion-Setup-0.10.0.exe**: für neue Nutzer ohne vorhandene Installation. Enthält Companion, Node.js, PostgreSQL und CS Demo Manager. Das Setup lädt HLAE und FFmpeg vom Originalanbieter mit SHA256-Prüfung nach, richtet eine private Datenbank ein und fragt nach einem frei wählbaren Administratorpasswort. Steam und CS2 müssen bereits installiert sein. Internetverbindung erforderlich.
- **TecMon-Companion-Update-0.10.0.exe**: für bereits eingerichtete Installationen. Ersetzt nur Companion-Programmdateien und erhält Datenbank, Kennwörter, Tools, Demos und Videos.

Vor Installation oder Update den Companion und CS Demo Manager schließen. Die Prüfsumme des Installers steht neben der EXE als `.sha256`; das Update hat ein eigenes JSON-Manifest und `SHA256SUMS.txt`. WebView2 Evergreen Runtime muss vorhanden sein; siehe [Build- und Laufzeitvoraussetzungen](BUILDING.md).

## Aus Quellcode starten

Node.js ab Version 24; Steam und CS2 für echte Aufnahmen. Die Laufzeit selbst hat keine npm-Abhängigkeiten. Die Entwicklungsabhängigkeit TypeScript wird nur zum Erzeugen der CSDM-Konfigurationsvorlage benötigt.

```sh
npm ci
npm test
npm start
```

Ohne native Installation startet der Quellmodus das lokale Studio, richtet aber keine vollständige Toolchain ein. Native Dateiauswahldialoge und die verwaltete Datenbank benötigen den Windows-Build. Eine vorhandene kompatible CS-Demo-Manager-/PostgreSQL-Installation kann im Quellmodus verwendet werden.

## Windows-Installer bauen

Siehe [BUILDING.md](BUILDING.md). Alle Launcher-, Installer- und Serverquellen sind enthalten. Drittanbieterpakete werden über die dokumentierten Originalquellen bezogen und mit den hinterlegten SHA256-Werten geprüft. Es sind keine vorkonfigurierten Datenbanken oder fertigen Runtime-Binaries im Repository enthalten.

## Verwendung und aktueller Stand

Siehe [Anleitung](tools/cs2-companion/README.md). Companion starten, einmal mit dem TecMon-Replay im Browser verbinden und dort „In CS2 aufnehmen“ wählen. Download oder Demo-Übergabe, Aufnahme und MP4-Rückgabe laufen automatisch. JSON-Import und manuelle Dateiauswahl bleiben als Alternative verfügbar.

Version 0.9.0 unterstützt Spieler-Egoansichten bei normalem Tempo und Spielton ohne Voicechat. Browser-Kameras, automatische Killcam, Zeitlupe, Musik und Web-Overlays werden nicht übertragen. Maximal 40 Szenen / 20 Minuten pro Auftrag. HLAE ausschließlich für Demo-Aufnahmen einsetzen; Steam und CS2 werden nicht mitgeliefert.

31 automatisierte Companion-Tests sind enthalten. Eine isolierte Windows-Einrichtung wurde mit PostgreSQL-Anmeldung, Sonderzeichen-Passwort, CSDM-Tabellenmigrationen, FFmpeg und nativem Launcher getestet. Diese Tests sind kein Nachweis einer vollständigen Aufnahme jeder Demo oder jeder CS2-Version. Ein realer Test auf CS2 1.41.9.6 erzeugte eine 2-Sekunden-MP4 sowie einen zusammengesetzten Clip aus zwei Spieleransichten mit dem korrigierten offiziellen CS2-Plugin.

## Lizenzen und Herkunft

Der ursprüngliche Companion wurde als eigenständiger Quell-Snapshot aus TecMon extrahiert. Die erste öffentliche Historie enthält nur die ausgewählten Companion-Dateien, keine Website-Commits. Das TecMon-Logo dient zur Kennzeichnung; die Lizenz gewährt keine Markenrechte.

Drittanbieter behalten ihre eigenen Lizenzen, einschließlich MIT, PostgreSQL License und GPL. Siehe [THIRD-PARTY-NOTICES.txt](tools/cs2-companion/windows/THIRD-PARTY-NOTICES.txt) und [dependency-manifest.json](tools/cs2-companion/windows/dependency-manifest.json). Diese MIT-Lizenz ersetzt keine Lizenz der gebündelten Drittanbieter. Wer Binärpakete weitergibt, muss deren jeweilige Lizenz- und Quellcodepflichten erfüllen. Dieses Repository veröffentlicht den Companion-Quellcode, die Build-Skripte und kleine Programm-Updates. Ein selbst gebauter Installer enthält Node.js, PostgreSQL und CS Demo Manager mit ihren Lizenzen; HLAE und FFmpeg lädt er bei Bedarf direkt von den Originalanbietern herunter.

## Neu in 0.4

Sharecodes oder Match-Dateien lokal herunterladen; mehrere Spielerperspektiven in einem gemeinsamen Highlight-Auftrag; TecMon-Icon in EXE/Installer/Oberfläche; sicherer Umgang mit einer zurückgebliebenen privaten Datenbank beim Update. Die neue Team-Auswahl erfordert den entsprechenden Website-Stand. Siehe Anleitung unter tools/cs2-companion/README.md.

Downloads: [GitHub Releases](https://github.com/KOALAaufPILLEN/tecmon-companion/releases/latest). Für neue Installationen die Setup-EXE, für bestehende Installationen die kleine Update-EXE verwenden. Beide lassen sich mit den öffentlichen Build-Skripten selbst bauen.

Für bestehende Installationen gibt es im Release eine kleine Update-EXE. Sie aktualisiert nur Companion-Dateien; Datenbank und große Tools bleiben erhalten. Ab 0.4 ist die Updateprüfung direkt im Companion verfügbar.


Neu in 0.5: Sharecode-Feld im Website-Auftrag, direkte Verbindung zwischen TecMon und dem lokalen Companion, Download oder Download + CS2-Aufnahme von der Webseite, Rückgabe der MP4 und offizieller Plugin-Fix für neuere CS2-Versionen. [Verbindungsablauf und genaue Grenzen](tools/cs2-companion/README.md).


## Video-Branding ab 0.6

Intro, Spielernamen und Wasserzeichen werden lokal mit FFmpeg ergänzt; Freitext und optionales Outro kommen aus dem Website-Auftrag. Das separat geladene Branding-Paket wird gegen feste SHA256-Werte geprüft. Der native Helfer prüft und sperrt die Eingabedateien während des Renderns gegen Schreiben und Ersetzen. Details, Grenzen und Schriftlizenzen stehen in der [Companion-Anleitung](tools/cs2-companion/README.md). Der öffentliche Build enthält zusätzlich einen Windows-Test der tatsächlichen Dateisperren.

## Neu in 0.6.1

Originales TecMon-Logo, natives Startfenster mit animiertem Ladebalken, PostgreSQL erst bei Nutzung und verbesserte Update-Übergabe mit Wiederverbindung. Siehe die Anleitung für Details.

## Neu in 0.7.0

Kompakte Standardansicht für die Browser-Steuerung. „Erweitert“ zeigt das bisherige vollständige lokale Studio. Download, Aufnahme und MP4-Übernahme können nach einmaliger Verbindung auf TecMon bedient werden; der Companion bleibt im Hintergrund geöffnet.

## Neu in 0.8.0

Native transparente Windows-Desktopfigur mit dem TecMon-Webseiten-Bot: schweben, ziehen und per Klick ein Verbindungs-/Einstellungsfenster ein- oder ausklappen. Infobereich-Menü für Bewegung, Animation, Vordergrund und Beenden. Während lokaler Aufträge wird die Figur ausgeblendet. Das Fenster verwendet die vorhandene lokale Oberfläche in WebView2; Aufnahme und Dateien bleiben lokal. Details und Voraussetzungen stehen in der Anleitung.

## Neu in 0.8.1

Native Holo-Sprechblase statt Windows-Rahmen: Spitze zur Figur, eigener ziehbarer Kopfbereich mit Einklappen-/Schließen-Buttons, Cyan-Scanlinien und passende Scrollbar sowie Eingaben.

## Neu in 0.9.0

Vollständige Browser-Aufnahme mit Sharecode oder direkt übergebener Originaldemo: keine manuelle Pfad-/JSON-Übergabe nötig. Validierte, besitzergebundene Loopback-Übertragung in begrenzten Stücken. Download/Übertragung, Aufnahme, Branding und fertige MP4 werden auf der Webseite gesteuert. Details in der Anleitung.


## Neu in 0.9.1

Vollständiger Windows-Installer und getrenntes Programm-Update im Release. Der FFmpeg-Download verwendet einen festen Upstream-Release mit SHA256 anstelle des täglich ersetzten latest-Links. GitHub prüft eine komplette isolierte Neuinstallation vor dem Upload.


## Neu in 0.10.0

Eigenes Cyberpunk-Video-Design: transparente Neon-Konturen am unveränderten CS2-Radar, eine dauerhaft sichtbare schräge Spieleranzeige, Logo und Randakzente in Cyan, Violett und TecMon-Gold. Bei einem Wechsel der Steam-ID fährt ein 1,1 Sekunden langer animierter Stinger mit dem nächsten Spielernamen über das Bild. Mehrere Szenen desselben Spielers bleiben direkt verbunden; keine Szene wird gekürzt. Die neue Grafik wird als festes Branding-v2-Paket geladen, SHA256-geprüft und während des Renderns gesperrt. Die Quellen der eigenen Vektorgrafiken liegen unter tools/cs2-companion/branding/source.
