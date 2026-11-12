# Sicherheit und Prüfung

## Meldungen

Bitte Sicherheitslücken vertraulich über **Security → Report a vulnerability** in diesem GitHub-Repository melden. Falls diese Funktion nicht verfügbar ist, zunächst ein Issue ohne Exploit, Tokens, Passwörter, private Pfade oder persönliche Demo-Daten eröffnen und um einen privaten Kontakt bitten. Keine Zugangsdaten in öffentliche Issues oder Pull Requests kopieren.

## Vertrauensgrenzen

Der Companion ist eine Desktop-Anwendung mit den Rechten des angemeldeten Windows-Kontos, keine Sandbox. Windows-Dateidialoge können auf alle für dieses Konto zugänglichen Laufwerke zeigen. Der Benutzer wählt Demo-Datei und lokale Programme; diese Programme werden anschließend ausgeführt. Fremde ausführbare Dateien und Demo-Parser sind eigene Angriffsflächen.

Die lokale HTTP-API lauscht ausschließlich auf IPv4-Loopback. Host-/Origin-Prüfung, zufälliges Sitzungstoken und ausdrückliche Aufnahmebestätigung sollen verhindern, dass eine fremde Website unbemerkt Aufnahmen startet. Loopback und Sitzungstoken schützen nicht vor Schadsoftware, die bereits im gleichen Benutzerkonto läuft. `/api/health` gibt nur Anwendung, Version und Installationskennung aus.

Auftragsdateien sind untrusted data. `job.mjs` erlaubt nur das versionierte Format, validierte Steam-IDs und Tickbereiche. Programme, Shell- oder Spielbefehle werden nicht aus importierten Aufträgen übernommen. Videoausgabe und Pfadauflösung werden im Server geprüft. Der Server und die nativen Programm-/Ordnerauswahlen sind zentrale Review-Bereiche.

## Lokale Zugangsdaten

Der Installer nimmt das Administratorpasswort verdeckt entgegen und übergibt es an den Node-Unterprozess über UTF-8-stdin, nicht als Kommandozeilenargument. Für PostgreSQL wird vorübergehend eine private Passwortdatei verwendet. Temporäre Administrator-Passwortdateien werden anschließend entfernt. Bei fehlgeschlagener Einrichtung kann ein temporäres generiertes Anwendungspasswort zur Wiederaufnahme im privaten Datenordner verbleiben.

Der Datenbereich `<gewählter Datenordner>/TecMon-Private` wird über Windows-ACLs auf das eigene Konto und SYSTEM beschränkt. Das generierte CSDM-Anwendungskennwort muss lokal in dessen `settings.json` stehen; es ist nicht verschlüsselt. ACLs und Loopback reduzieren den Zugriff, ersetzen aber keine Sicherheit gegen Prozesse mit gleichen Benutzerrechten oder Administratoren. Bei der Deinstallation bleiben Daten und Datenbank erhalten.

## Dateien, die niemals veröffentlicht werden dürfen

`.env*`, OAuth-Client-JSONs, Refresh-/Access-Tokens, `installation*.json`, CSDM-`settings.json`, PostgreSQL-Daten, Passwortdateien, Laufzeitprotokolle, persönliche Demos, Jobdateien und Videos. `.gitignore` hilft gegen versehentliche Aufnahme; jede Änderung muss trotzdem geprüft werden. Auch alte Git-Commits können Secrets enthalten; dieses Repository beginnt deshalb mit einer neuen Historie.

## Abhängigkeiten und Grenzen

Die Node-Laufzeit verwendet nur eingebaute Module. Build und Windows-Paket greifen auf externe Tools zu. Paketversionen und Hashes stehen im Manifest; die Build-Anleitung beschreibt zusätzlich Node und 7-Zip. Ein SHA256-Abgleich mit einem im selben Repository gespeicherten Wert schützt nicht vor einem kompromittierten Repository. Installer und EXE sind derzeit nicht digital signiert.

Bekannte Einschränkung von 0.3.1: Nach einer unterbrochenen Installation kann der private TecMon-PostgreSQL-Prozess DLLs sperren. Vor erneutem Entpacken muss genau dieser Prozess über `pg_ctl stop` für den eigenen TecMon-Cluster sauber beendet werden. Keine fremden PostgreSQL-Prozesse pauschal beenden. Seit 0.4 prüft der Installer vor dem Entpacken die verwalteten Datenbankpfade und beendet einen zurückgebliebenen eigenen Cluster sauber. Einen noch geöffneten Companion und CS Demo Manager vorher selbst schließen.

Automatisierte Tests und Secret-Scans sind Prüfungen mit begrenzter Abdeckung. Es wurde kein unabhängiges Sicherheitsaudit durchgeführt und keine Fehlerfreiheit zugesichert.

## Programm-Updates ab 0.4

Die Updateprüfung verwendet ausschließlich stabile Releases von KOALAaufPILLEN/tecmon-companion. Version, Asset-Pfad, Größe (maximal 20 MiB) und SHA256 werden vor dem Start geprüft. Ein zweiter Klick bestätigt die Installation. Der native Helfer wartet auf das Ende des alten Servers und akzeptiert nur Programmdateien: insbesondere keine Runtime-/Tool-Verzeichnisse oder installation.json. Bestehende Verzeichnisverknüpfungen werden abgelehnt; identische Dateien bleiben unverändert. Die Release-Metadaten und das Paket liegen im gleichen GitHub-Konto: der Hash schützt gegen beschädigte Downloads, nicht gegen ein kompromittiertes Maintainer-Konto. Updates sind derzeit nicht zusätzlich digital signiert.


## Browser-Verbindung ab 0.5

Fest erlaubte TecMon-Origins, ausdrückliche lokale Freigabe per Zahlencode (fünf Minuten gültig), origin-gebundene Tokens und eigene Auftragsrechte. Browser-Tokens bleiben lokal im Browser; Companion persistiert ausschließlich Hashes und Origin in `bridge-devices.json` im privaten Profil. Verbindungen lassen sich lokal widerrufen. Keine frei wählbaren Pfade, Executables, Datenbankbefehle oder Updates über die Browser-Bridge. Download und Aufnahme teilen eine exklusive Sperre. Kein pauschales CORS für Preview-Domains.

Der verwaltete Recorder lädt für das bekannte originale CSDM-3.20.1-Plugin den offiziellen Upstream-Build mit Fix #1483. Unveränderliche Quellrevision, URL und SHA256 stehen im öffentlich prüfbaren `recording-engine.mjs`; ein unbekanntes vorhandenes Plugin wird nicht überschrieben. Der Dienst führt keine fremden Downloads aus Website-Aufträgen aus.


## Branding-Integrität ab 0.6

Feste Paket- und Datei-SHA256-Werte im Programmcode, fester Release-Download und Ablehnung manipulierter Cache-Dateien. Aufträge dürfen keine Asset-URLs, Filter oder Soll-Prüfsummen vorgeben. Private, zufällige Arbeitsordner; UTF-8-Texte mit deaktivierter FFmpeg-Textexpansion. Der native Helfer erhält seine Parameter über stdin, öffnet Eingaben mit FileShare.Read, prüft ihre Hashes und hält die Handles während FFmpeg offen. Windows blockiert dadurch Schreiben, Löschen und Ersetzen. Fehler liefern kein ungebrandetes Video als vermeintlich fertiges Ergebnis aus. Wer den Programmcode oder den Prozess mit ausreichenden Rechten verändert, kann diese Schutzkette umgehen; dies ist kein Schutz vor einem kompromittierten Konto oder Administrator.


## CS2-Rundentipps ab 0.14

Die Rundentipps nutzen ausschließlich Valves offizielle Game State Integration: CS2 sendet selbst an `127.0.0.1:31977/gsi`. Es gibt keinen Speicherzugriff, keine Injektion, keine Hooks, keine Overlays im Spielprozess und keine Maus- oder Tastatureingaben an das Spiel. Die cfg-Datei `gamestate_integration_tecmon.cfg` entsteht erst nach dem Einschalten, mit eigenem zufälligem Token, und wird beim Ausschalten entfernt. `gsiConfigText()` fordert nur eigene Spielerdaten an (`provider`, `map`, `round`, `player_id`, `player_state`, `player_weapons`, `player_match_stats`, `phase_countdowns`); `allplayers_*`, `bomb`, `grenades` und `player_position` sind ausgeschlossen, ein Test prüft das. Von `phase_countdowns` wird nur der Kaufzeit-Countdown ausgewertet, nie der Bomben-Countdown. Während einer Demo-Aufnahme werden GSI-Daten ignoriert. Turnier- oder FACEIT-Regeln für Zusatzprogramme können strenger sein.

## Daten von der Webseite ab 0.15

`POST /bridge/insights` nimmt nur von freigegebenen Webseiten mit gültigem Bridge-Token eine Zusammenfassung der eigenen Matches an (`insights-v1`, ab 0.16 `insights-v2` mit Summen eigener Gewohnheiten und Waffenwerte). `cleanInsights()` prüft und kürzt alle Felder; Daten anderer Spieler werden nicht angenommen. Gespeichert wird lokal in `insights.json` (Modus 600, höchstens vier Konten). Die Daten verlassen den PC nicht und lassen sich im Companion mit „Webseiten-Daten löschen“ entfernen.

## Eigene TecMon-Engine ab 0.17

Download und Aufnahme können ohne CS-Demo-Manager-Programm und ohne PostgreSQL laufen (`internal-recorder.mjs`, `valve-download.mjs`). Fremde Binärdateien starten nur mit fester Prüfsumme: das CS2-Plugin über `PLUGIN_SHA256` in `recording-engine.mjs`, boiler-writter über die feste npm-Integrität. Bei Abweichung bricht der Companion ab. Läuft CS2 schon, bricht die Aufnahme ab, statt das Spiel zu beenden; in `gameinfo.gi` wird nur die eigene Zeile ergänzt und danach wieder entfernt. Befehle in der Aktionsdatei und der Kameraplan für das HLAE-Skript (`camera-script.mjs`) entstehen nur aus geprüften Zahlen und bereinigten Namen des Auftrags, nie aus freiem Text der Webseite. Das Skript läuft nur bei der Offline-Demo-Wiedergabe, nie im Live-Match. „Kamera im Spiel setzen“ nutzt einen eigenen CS2-Konfigurationsordner und liest `console.log` nur.

## Automatische Updates ab 0.17.1

Automatische Updates nutzen dieselben Prüfungen wie der Knopf (Manifest, Größe, SHA-256), laufen nie während Download, Aufnahme oder Kamera-Sitzung und lassen sich unter „Erweitert → Updates & Info“ abschalten (`updates.json`). Für die Grenzen der Hash-Prüfung gilt der Abschnitt „Programm-Updates ab 0.4“.
