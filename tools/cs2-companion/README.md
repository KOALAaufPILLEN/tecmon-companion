# TecMon Companion · Windows Setup 0.4.0

Die empfohlene Ausgabe ist **TecMon-Companion-Setup-0.4.0.exe**. Das vollständige Offline-Paket enthält die Companion-EXE, Node.js, PostgreSQL 18, CS Demo Manager, HLAE, FFmpeg und bei Bedarf die Microsoft Visual C++ Laufzeit. Steam und CS2 müssen installiert sein.

## Einrichten

1. Setup starten. Programmordner, Datenordner und optional den Demo-Ordner wählen. Alle Laufwerke sind über die normale Windows-Dateiauswahl erreichbar, soweit das Windows-Konto darauf zugreifen darf.
2. Den automatisch gefundenen CS2-Pfad prüfen oder `cs2.exe` auswählen.
3. Das PostgreSQL-Administratorpasswort frei wählen und wiederholen. Mindestens acht Zeichen; Sonderzeichen und Unicode sind möglich, Zeilenumbrüche nicht.
4. Lizenzhinweise lesen und „Installieren & einrichten“ wählen. Bei fehlender Microsoft-Laufzeit öffnet sich deren offizieller Installer mit gegebenenfalls erforderlicher Adminfreigabe.
5. Das Setup erstellt einen TecMon-eigenen PostgreSQL-Bereich, wählt einen freien lokalen Port und legt `tecmon_csdm` als Datenbank und Anwendungskonto an. Alle Tool-Pfade, die Datenbankverbindung und ein separater HLAE-Config-Ordner werden automatisch hinterlegt und geprüft. Ein bestehender fremder PostgreSQL-Dienst wird nicht verändert.
6. Danach „TecMon Companion starten“ oder die Desktop-/Startmenü-Verknüpfung verwenden. Das Studio öffnet sich als eigenes Edge-App-Fenster; alternativ wird der Standardbrowser verwendet.

Das gewählte Administratorpasswort wird nur zur Initialisierung verwendet. Für CS Demo Manager erzeugt das Setup ein separates Anwendungspasswort. Die dafür erforderlichen Einstellungen liegen unter `<Datenordner>/TecMon-Private`, mit Windows-Zugriff ausschließlich für das eigene Konto und SYSTEM. Passwörter werden weder im Protokoll noch auf der Webseite ausgegeben. Bei einem Update bleibt das bisherige Administratorpasswort erhalten; bei einer noch nicht abgeschlossenen Einrichtung dasselbe zuerst gewählte Passwort erneut verwenden.

CS Demo Manager erzeugt seine Tabellen beim ersten Start bzw. der ersten Analyse selbst. Der Installer prüft vorher bereits die Datenbankanmeldung, FFmpeg und den tatsächlichen CS-Demo-Manager-CLI-Einstiegspunkt. PostgreSQL startet zusammen mit dem Companion. Vor dem Deinstallieren über „Companion beenden“ schließen; Datenbank, Demos und Videos im separaten Datenordner bleiben bei der Deinstallation erhalten.

## Highlights aufnehmen

### Neu in 0.4: Sharecodes und Team-Videos

Im Steam-Match-Bereich der Webseite „Für Companion exportieren“ wählen: Die Datei enthält ausschließlich bis zu zehn Sharecodes, keine API-Schlüssel oder Steam-Anmeldecodes. Im Companion über „Auftrag / Matches öffnen“ importieren, Steam lokal anmelden und den Download bestätigen. Alternativ Sharecodes direkt einfügen. CS2 und die CS-Demo-Manager-Oberfläche vorher schließen. Der Companion verwendet `csdm dl-valve`, lädt und entpackt lokal in einen eigenen Download-Ordner. Abgelaufene Valve-Demos werden als Fehler angezeigt. Download und Aufnahme laufen nacheinander; kein Spiele- oder Demo-Upload auf den Webserver.

Bei aus Steam geladenen Replays enthält der Aufnahmeauftrag auch den bekannten Sharecode. Der Companion kann die heruntergeladene Demo dann diesem Auftrag zuordnen. Bei manuell geladenen Dateien die passende Originaldemo selbst auswählen; ein Sharecode lässt sich nicht aus jeder Demo rekonstruieren.

In den Highlights mehrere Spieler, „Alle Spieler“ oder „Team des gewählten Spielers“ auswählen. Die Teamzuordnung richtet sich nach der ersten Runde, nicht nach wechselnden T-/CT-Seiten zur Halbzeit. Ein gemeinsames Zeitbudget (z. B. bis zu fünf Minuten) begrenzt die Summe aller Szenen. Die Auswahl berücksichtigt Spieler reihum, vermeidet überlappende Szenen derselben Perspektive und sortiert anschließend chronologisch. Jede Szene bleibt eine Egoansicht; verschiedene Spieler erscheinen nacheinander in einer gemeinsamen MP4, kein Splitscreen. Der Export bleibt mit Aufträgen der Version 1 kompatibel.

Beim Update zuerst den laufenden Companion über „Companion beenden“ und die CS-Demo-Manager-Oberfläche schließen. Das Setup beendet danach gegebenenfalls nur den anhand seiner Konfiguration und Marker erkannten privaten TecMon-PostgreSQL-Cluster vor dem Entpacken. Daten und bisheriges Administratorpasswort bleiben erhalten.

Im TecMon-Replay unter „In CS2 aufnehmen“ den Auftrag als `.tecmon.json` exportieren. Im Companion öffnen, Originaldemo mit „Demo wählen“ auswählen, CS2-Partie beenden und Aufnahme bestätigen. Danach die MP4 im Replay auswählen und mit Spielername/Freitext und Steam-Link veröffentlichen. Demos und Aufnahme bleiben lokal; der Companion erhält keine YouTube-Secrets.

Version 0.4.0 überträgt Spieler-Egoansichten bei normalem Tempo und Spielton ohne Voicechat. Browser-Kameras, automatische Killcam, Zeitlupe, Musik und Web-Overlays werden nicht übertragen. Originaldemo und Tickbereiche müssen zusammengehören. Maximal 40 Szenen / 20 Minuten pro Auftrag. HLAE ausschließlich für Demos verwenden, nicht mit Matchmaking verbinden; nach CS2-Updates kann eine neue HLAE-Version erforderlich sein.

## Entwickler

Das kleine ZIP auf dem Website-Branch ist ein Quellpaket. Für den vollständigen Installer `scripts/build-companion-installer.ps1` verwenden. Der Build prüft `windows/dependency-manifest.json`, extrahiert unveränderte Originalpakete und kompiliert Launcher/Setup mit dem vorhandenen Windows-.NET-Framework-Compiler. Der Quellcode von CS Demo Manager muss auf Tag `v3.20.1` stehen. Die Binärpakete sind separat; keine Laufzeit-Binaries gehören ins Git-Repository.

Tests: `node --test "tools/cs2-companion/test/*.test.mjs"`. Der reale Einrichtungstest verwendet einen eigenen Test-Datenordner und ein generiertes Testpasswort; keine fremden Datenbanken. Ein erfolgreicher echter CS2-Aufnahmetest wird dadurch nicht behauptet.

Paketversionen und Lizenzhinweise: `windows/THIRD-PARTY-NOTICES.txt`, `windows/dependency-manifest.json`. Engine-Dokumentation: https://cs-demo-manager.com/docs/cli

GitHub-Release: Das Kernpaket enthält Companion, Node.js, PostgreSQL und CS Demo Manager. HLAE und FFmpeg werden bei fehlender Installation direkt von ihren Originalanbietern heruntergeladen und anhand des Manifests geprüft. Dafür ist beim ersten Setup Internet nötig. Bereits installierte Videotools werden weiterverwendet. Ein vollständiger lokaler Offline-Build ist weiterhin möglich.

## Aktualisieren ohne Neuinstallation

Für eine bestehende 0.3.1-Installation die kleine TecMon-Companion-Update-0.4.0.exe aus dem GitHub-Release verwenden. Vorher Companion und CS Demo Manager schließen. Die Update-EXE erkennt den installierten Programmordner über den Deinstallationseintrag; alternativ den eigenen TecMon-Programmordner auswählen. Es werden nur eigene Programmdateien aktualisiert; unveränderte Dateien werden per SHA256 übersprungen. Runtime, Tools, Datenbank, Zugangsdaten, Demos und Videos werden nicht ersetzt.

Ab 0.4: Im Companion Auf Updates prüfen und anschließend Update installieren wählen. Das Paket wird ausschließlich aus stabilen Releases des offiziellen Repositories bezogen. Größe und SHA256 werden vor dem Start geprüft. Nach dem Beenden des lokalen Servers übernimmt ein separater Update-Prozess und startet den Companion wieder. Änderungen an großen Drittanbieter-Tools können weiterhin einen gesonderten Tool-/Installer-Schritt erfordern.
