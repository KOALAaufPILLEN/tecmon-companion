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

Bekannte Einschränkung von 0.3.1: Nach einer unterbrochenen Installation kann der private TecMon-PostgreSQL-Prozess DLLs sperren. Vor erneutem Entpacken muss genau dieser Prozess über `pg_ctl stop` für den eigenen TecMon-Cluster sauber beendet werden. Keine fremden PostgreSQL-Prozesse pauschal beenden. Der Installer übernimmt das Beenden vor dem Entpacken derzeit nicht automatisch.

Automatisierte Tests und Secret-Scans sind Prüfungen mit begrenzter Abdeckung. Es wurde kein unabhängiges Sicherheitsaudit durchgeführt und keine Fehlerfreiheit zugesichert.
