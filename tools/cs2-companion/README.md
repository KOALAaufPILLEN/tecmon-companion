# TecMon Companion · Windows Setup 0.11.0

## Cyberpunk-Overlay und Spielerwechsel ab 0.11

Das dauerhafte Video-Design verwendet transparente Neon-Konturen in Cyan/Violett, TecMon-Gold, eine schräge Spieleranzeige mit Map und Szenennummer sowie dezente Randakzente. Die originale CS2-Minimap wird nicht verschoben oder ausgeschnitten; der Rahmen ist für den Standard-Radar der 16:9-Aufnahme ausgelegt. Abweichende persönliche HUD-Skalierungen können die Ausrichtung verändern.

Bei einem Wechsel der Steam-ID zwischen Szenen wird automatisch ein 1,1 Sekunden langer animierter Stinger eingefügt. Er zeigt Logo und nächsten Spielernamen, schaltet die eingefrorenen Spielbilder unter einer vollständig deckenden Grafik um und gibt die nächste Szene frei. Die eigentlichen Szenen werden nicht gekürzt. Aufeinanderfolgende Szenen desselben Spielers bekommen keinen Stinger. Der Übergang hat eine stille Tonspur; die Spieltonspuren der Szenen bleiben erhalten.

Das neue Branding-v2-Paket wird einmal von einer festen Release-URL geladen. Paket, PNGs, Logo und Schrift haben feste SHA256-Werte. Der native Renderer prüft und sperrt die Grafiken, Filter, Textdateien und Quellvideos gegen Schreiben/Ersetzen bis FFmpeg fertig ist. Eigene SVG-Quellen und Build-Skript sind öffentlich. Deaktiviertes Video-Branding überspringt auch das HUD und die Stinger. Intro und Outro bleiben unabhängig wählbar.

## X-Ray und feste Freecam-Punkte (Companion mit `camera-points-v1`)

Auf der Webseite läuft die CS2-Aufnahme jetzt in vier Schritten: Szenen, Kamera, Aufnahme, Video & YouTube.

- **X-Ray** ist standardmäßig an. Der Auftrag trägt `xray` (fehlt es, gilt `true`), der Companion setzt daraus `showXRay` je Sequenz.
- **Kamerapunkte:** In der 3D-Flugkamera „Kamerapunkt setzen“ oder einen Punkt auf Kopfhöhe des gewählten Spielers anlegen. Je Szene wählt man Egoansicht oder einen Punkt, optional nur für die ersten Sekunden, danach Ego. Im Auftrag stehen dafür je Sequenz bis zu 12 `cuts` (`{tick, kind:"free", x, y, z, pitch, yaw}` oder `{tick, kind:"player"}`), ausschließlich als Zahlen.
- Nach `csdm analyze` legt der Companion die Punkte in der Tabelle `cameras` seiner eigenen CS-Demo-Manager-Datenbank an (Kommentar `tecmon-companion`), CSDM springt in der Aufnahme per `spec_goto` hin. Nach der Aufnahme werden genau diese Einträge wieder gelöscht. Ohne verwaltete Installation werden Aufträge mit Punkten abgelehnt.
- CSDM kennt nur harte Schnitte zwischen Punkten. Fließende Kamerafahrten sind noch nicht umgesetzt.

## Video-Branding ab 0.6

Die Webseite exportiert die Optionen für Intro (3 Sekunden), Spielernamen, Wasserzeichen, Freitext und optionales Outro (2 Sekunden). Ein Spieler erhält „Spielername · HIGHLIGHTS“, mehrere Spieler „TEAM-HIGHLIGHTS“. Dekorative Zeichen werden für die Videoschrift bereinigt; originale Namen und Steam-IDs bleiben im Auftrag erhalten. Barlow Condensed unterstützt vor allem lateinische Namen; andere Schriftsysteme können Ersatzglyphen zeigen.

Der installierte Windows-Companion lädt beim ersten Branding-Auftrag das feste `TecMon-Branding-v1.json` aus Release v0.6.1. Es enthält TecMon-Logo, Barlow Condensed Bold und OFL-Lizenz. Paket- und Einzeldatei-SHA256 stehen fest im Code. Geänderte Downloads oder Cache-Dateien werden abgelehnt. URLs und angebliche Soll-Prüfsummen aus Aufträgen werden nicht verwendet. Das Paket liegt zusätzlich unter `branding/` als öffentliche Testfixture; `scripts/build-branding-pack.mjs` dokumentiert Quellen, Revisionen und Prüfsummen.

Ein zufälliger privater Arbeitsordner enthält die benötigten Visuals und Texte. Der native Helfer öffnet vor FFmpeg die Eingabedateien mit `FileShare.Read`, prüft SHA256 über die geöffneten Handles und hält sie während des Renderns offen. Windows blockiert dadurch Schreiben, Löschen und Ersetzen. Steuerparameter kommen über die Standardeingabe aus dem Companion. Texte werden wörtlich als UTF-8 mit `drawtext expansion=none` verwendet. Temporäre Arbeitsdateien werden anschließend entfernt. Rohaufnahmen bleiben lokal erhalten; als Ergebnis wird ausschließlich die erfolgreich gebrandete MP4 angeboten.

Diese Schutzkette verhindert beschädigte Downloads und Dateiaustausch während des Renderns. Sie ist kein Schutz vor jemandem, der den Companion-Code, dessen feste Prüfsummen oder den laufenden Prozess mit ausreichenden Rechten verändern kann.

Die Webseite verlangt für aktiviertes Branding Companion 0.6+. Bei JSON-Import ebenfalls zuerst aktualisieren. Ältere Aufträge erhalten in 0.6 standardmäßig Branding mit Intro; alternativ ist Branding ausdrücklich abschaltbar. Der Quellmodus benötigt für Branding den nativen Windows-Helfer.

Validierung: 25 Companion-Tests einschließlich verändertem Paket/Cache, Titelbildung, Dateireihenfolge, wörtlichen Texten, Cleanup und Abbruch vor CS2 bei Integritätsfehler. Ein Windows-Test blockiert echte Schreib- und Löschversuche und verhindert den Encoderstart nach einer Dateiveränderung. Echte FFmpeg-Tests mit vorher aufgenommenen CS2-Szenen erzeugten Single- und Team-Videos einschließlich Namenswechsel, Intro und optionalem Outro, auch in einem Umlautpfad.

Für eine bestehende Installation die kleine **TecMon-Companion-Update-0.9.0.exe** aus dem GitHub-Release verwenden oder im Companion „Auf Updates prüfen“ wählen. Das Setup für neue Installationen kann mit den öffentlichen Build-Skripten erstellt werden; ein großer Setup-Download ist aktuell nicht im Release verfügbar. Steam und CS2 müssen installiert sein.

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

### Neu in 0.5: Webseite direkt verbinden und CS2-Plugin reparieren

1. Companion starten, auf **https://tecmon.online** „Companion verbinden“ anklicken. Falls der Browser fragt, lokalen Zugriff erlauben.
2. Den Zahlencode vergleichen und im Companion unter „Webseite verbinden“ diese Webseite freigeben. Die Verbindung gilt nur für genau diese TecMon-Adresse und diesen Browser und lässt sich im Companion widerrufen.
3. Danach den Companion im Hintergrund laufen lassen. Im Steam-Bereich der Webseite Demos direkt herunterladen. Bei Highlights den Sharecode des passenden Matches eintragen, Spieler/Szenen wählen und „Demo herunterladen & in CS2 aufnehmen“ starten.
4. Steam muss angemeldet und CS2 / CS Demo Manager vor dem Start geschlossen sein. Download, Entpacken, Analyse, CS2-Aufnahme und Konvertierung laufen auf dem PC. Die fertige MP4 erscheint auf der geöffneten Webseite und bleibt im lokalen Auftragsordner. Ein Seitenwechsel unterbricht nur die Statusanzeige, nicht den lokalen Auftrag; das Ergebnis ist dann im Companion zugänglich.

Die JSON-Übergabe bleibt möglich. Der sichtbare Sharecode wird mit exportiert. Keine Steam-API-Schlüssel, Passwörter oder YouTube-Tokens gehören in diese Datei.

**Aufnahmefix:** Das unveränderte CSDM-3.20.1-Plugin kann unter neueren CS2-Versionen die komplette Demo abspielen, ohne Sprünge oder Aufnahme. Vor einer Aufnahme aktualisiert die verwaltete Installation ausschließlich das bekannte Original-Plugin auf den offiziellen Upstream-Build `01f655f20141d366e07a5869f84554df3a61c64a` mit Fix #1483. URL und SHA-256 sind in `recording-engine.mjs` festgelegt; ein unbekanntes Plugin wird nicht überschrieben. Das bisherige Plugin bleibt als `.3.20.1-backup` erhalten. Dafür ist beim ersten Mal Internet nötig. Die kleine Update-EXE enthält weiterhin keine großen Tool-Pakete.

Ein echter kurzer Test auf CS2 1.41.9.6 mit dem korrigierten Plugin erzeugte am 08.11.2026 eine 2-Sekunden-MP4 (720p, H.264/AAC) mit der ausgewählten Spieleransicht. Das ist kein Nachweis für jede Map, Demo oder längere Team-Aufnahme.

### Sharecodes und Team-Videos

Im Steam-Match-Bereich der Webseite „Für Companion exportieren“ wählen: Die Datei enthält ausschließlich bis zu zehn Sharecodes, keine API-Schlüssel oder Steam-Anmeldecodes. Im Companion über „Auftrag / Matches öffnen“ importieren, Steam lokal anmelden und den Download bestätigen. Alternativ Sharecodes direkt einfügen. CS2 und die CS-Demo-Manager-Oberfläche vorher schließen. Der Companion verwendet `csdm dl-valve`, lädt und entpackt lokal in einen eigenen Download-Ordner. Abgelaufene Valve-Demos werden als Fehler angezeigt. Download und Aufnahme laufen nacheinander; kein Spiele- oder Demo-Upload auf den Webserver.

Bei aus Steam geladenen Replays enthält der Aufnahmeauftrag auch den bekannten Sharecode. Der Companion kann die heruntergeladene Demo dann diesem Auftrag zuordnen. Bei manuell geladenen Dateien die passende Originaldemo selbst auswählen; ein Sharecode lässt sich nicht aus jeder Demo rekonstruieren.

In den Highlights mehrere Spieler, „Alle Spieler“ oder „Team des gewählten Spielers“ auswählen. Die Teamzuordnung richtet sich nach der ersten Runde, nicht nach wechselnden T-/CT-Seiten zur Halbzeit. Ein gemeinsames Zeitbudget (z. B. bis zu fünf Minuten) begrenzt die Summe aller Szenen. Die Auswahl berücksichtigt Spieler reihum, vermeidet überlappende Szenen derselben Perspektive und sortiert anschließend chronologisch. Jede Szene bleibt eine Egoansicht; verschiedene Spieler erscheinen nacheinander in einer gemeinsamen MP4, kein Splitscreen. Der Export bleibt mit Aufträgen der Version 1 kompatibel.

Beim Update zuerst den laufenden Companion über „Companion beenden“ und die CS-Demo-Manager-Oberfläche schließen. Das Setup beendet danach gegebenenfalls nur den anhand seiner Konfiguration und Marker erkannten privaten TecMon-PostgreSQL-Cluster vor dem Entpacken. Daten und bisheriges Administratorpasswort bleiben erhalten.

Im TecMon-Replay unter „In CS2 aufnehmen“ den Auftrag als `.tecmon.json` exportieren. Im Companion öffnen, Originaldemo mit „Demo wählen“ auswählen, CS2-Partie beenden und Aufnahme bestätigen. Danach die MP4 im Replay auswählen und mit Spielername/Freitext und Steam-Link veröffentlichen. Demos und Aufnahme bleiben lokal; der Companion erhält keine YouTube-Secrets.

Version 0.9.0 überträgt Spieler-Egoansichten bei normalem Tempo und Spielton ohne Voicechat. Browser-Kameras, automatische Killcam, Zeitlupe, Musik und Web-Overlays werden nicht übertragen. Originaldemo und Tickbereiche müssen zusammengehören. Maximal 40 Szenen / 20 Minuten pro Auftrag. HLAE ausschließlich für Demos verwenden, nicht mit Matchmaking verbinden; nach CS2-Updates kann eine neue HLAE-Version erforderlich sein.

## Entwickler

Das kleine ZIP auf dem Website-Branch ist ein Quellpaket. Für den vollständigen Installer `scripts/build-companion-installer.ps1` verwenden. Der Build prüft `windows/dependency-manifest.json`, extrahiert unveränderte Originalpakete und kompiliert Launcher/Setup mit dem vorhandenen Windows-.NET-Framework-Compiler. Der Quellcode von CS Demo Manager muss auf Tag `v3.20.1` stehen. Die Binärpakete sind separat; keine Laufzeit-Binaries gehören ins Git-Repository.

Tests: `node --test "tools/cs2-companion/test/*.test.mjs"`. Der reale Einrichtungstest verwendet einen eigenen Test-Datenordner und ein generiertes Testpasswort; keine fremden Datenbanken. Automatisierte Tests ersetzen den oben beschriebenen gesonderten realen Aufnahmetest nicht.

Paketversionen und Lizenzhinweise: `windows/THIRD-PARTY-NOTICES.txt`, `windows/dependency-manifest.json`. Engine-Dokumentation: https://cs-demo-manager.com/docs/cli

GitHub-Release: Das Kernpaket enthält Companion, Node.js, PostgreSQL und CS Demo Manager. HLAE und FFmpeg werden bei fehlender Installation direkt von ihren Originalanbietern heruntergeladen und anhand des Manifests geprüft. Dafür ist beim ersten Setup Internet nötig. Bereits installierte Videotools werden weiterverwendet. Ein vollständiger lokaler Offline-Build ist weiterhin möglich.

## Aktualisieren ohne Neuinstallation

Für eine bestehende 0.3.1-Installation die kleine TecMon-Companion-Update-0.9.0.exe aus dem GitHub-Release verwenden. Vorher Companion und CS Demo Manager schließen. Die Update-EXE erkennt den installierten Programmordner über den Deinstallationseintrag; alternativ den eigenen TecMon-Programmordner auswählen. Es werden nur eigene Programmdateien aktualisiert; unveränderte Dateien werden per SHA256 übersprungen. Runtime, Tools, Datenbank, Zugangsdaten, Demos und Videos werden nicht ersetzt.

Ab 0.4: Im Companion Auf Updates prüfen und anschließend Update installieren wählen. Das Paket wird ausschließlich aus stabilen Releases des offiziellen Repositories bezogen. Größe und SHA256 werden vor dem Start geprüft. Nach dem Beenden des lokalen Servers übernimmt ein separater Update-Prozess und startet den Companion wieder. Änderungen an großen Drittanbieter-Tools können weiterhin einen gesonderten Tool-/Installer-Schritt erfordern.


## Lokale Browser-Verbindung und Sicherheit

Der HTTP-Dienst bindet nur an `127.0.0.1:31977`. CORS ist auf `https://tecmon.online`, `https://app.tecmon.app` und `https://tecmon-app.vercel.app` begrenzt; Preview-Domains sind nicht pauschal freigegeben. Jede Verbindung braucht einen fünf Minuten gültigen Code und die ausdrückliche Freigabe im lokalen, sitzungsgeschützten Companion. Es gibt maximal 16 gespeicherte Verbindungen. Der Browser speichert sein zufälliges Zugriffstoken ausschließlich lokal; Companion speichert dessen SHA-256 und die genaue Website-Adresse unter `bridge-devices.json` im privaten Profil. Diese Datei gehört niemals ins Repository.

Freigegebene Webseiten dürfen nur Sharecodes herunterladen, validierte Szenen mit diesen Demos aufnehmen, ihren Auftragsstatus und ihre fertigen Videos abrufen. Sie dürfen keine lokalen Dateipfade, Programme, Spielbefehle, Datenbankoptionen oder Updates vorgeben. Es läuft höchstens ein Download-/Aufnahmeauftrag gleichzeitig. Andere verbundene Browser können fremde Aufträge nicht abrufen. „Verbindung vergessen“ entfernt nur das Token im Browser; „Verbindung widerrufen“ im Companion sperrt es dauerhaft.

Chrome/Edge können eine Berechtigung für lokalen/Loopback-Zugriff verlangen. Bei Ablehnung oder nicht unterstütztem Browser bleibt die JSON-/MP4-Dateiübergabe nutzbar. Das Companion-Fenster darf minimiert sein; „Companion beenden“ stoppt den Dienst.


## Neu in 0.6.1

Das originale TecMon-Logo erscheint im Windows-Icon und beim Start mit animiertem Ladebalken. Der lokale Dienst startet ohne PostgreSQL. Die private Datenbank startet erst für Download, Aufnahme, den ausdrücklichen Datenbanktest oder das Öffnen des CS Demo Managers. Die CSDM-Oberfläche wird nur auf Wunsch geöffnet.

Beim Update wird zuerst die Bestätigung an die Oberfläche übertragen, dann der lokale Dienst beendet. Der Updater wartet auf die Freigabe des Dienstes statt auf eine möglicherweise weiter belegte Prozess-ID. Die Oberfläche verbindet sich nach dem Neustart neu. Bei Problemen die kleine Update-EXE aus dem offiziellen Release verwenden; das Ergebnis steht im Programmordner unter `update-result.json`.


## Standardansicht und erweiterter Modus (0.7.0)

Der Companion öffnet standardmäßig eine kompakte Ansicht: Webseite öffnen, Browser-Verbindung und lokaler Auftragsstatus. „Erweitert“ rechts oben blendet das bisherige Aufnahme-Studio mit manuellem Import, Sharecodes, Tool-/Datenbank-Einstellungen, Updates und Protokollen ein. Eingaben und laufende Aufträge bleiben beim Umschalten erhalten; beim nächsten Öffnen ist die Standardansicht aktiv.

Im TecMon-Browser einmal „Companion verbinden“ wählen, die Zahlencodes vergleichen und die Anfrage im Companion freigeben. Bereits eingerichtete Verbindungen bleiben über Neustarts erhalten. Danach kann das Fenster minimiert bleiben: Match-Demos herunterladen, mehrere Spieler auswählen, Download + Aufnahme starten und die MP4 übernehmen funktioniert auf der Website. Steam muss lokal angemeldet und CS2 / CS Demo Manager vor dem Start geschlossen sein. Der Companion-Dienst muss weiterlaufen. Manueller Dateiimport und Sonderfälle bleiben unter „Erweitert“ verfügbar.

Verbindungsanfragen erscheinen automatisch auch in der Standardansicht. Nach dem Verbinden verschwindet der Einrichtungsbereich; Verbindungen lassen sich unter „Erweitert“ verwalten und widerrufen. Die Anzeige „Browser-Verbindung eingerichtet“ bedeutet eine gespeicherte Freigabe, nicht, dass gerade ein Browserfenster geöffnet ist.


## Windows-Desktopfigur (0.8.0)

Die native EXE öffnet jetzt den schwebenden Bot von der TecMon-Webseite statt eines separaten Edge-App-Fensters. Der Bot hat einen transparenten Hintergrund und wechselt seine Gesichtsausdrücke. Er fliegt langsam innerhalb des Arbeitsbereichs seines Monitors; mit gedrückter linker Maustaste lässt er sich auch auf andere Monitore ziehen. Ein kurzer Klick öffnet oder schließt das daneben positionierte Verbindungs-/Einstellungsfenster. Die Aufnahme-Tools starten weiterhin erst bei Bedarf.

Rechtsklick: Umherfliegen, Animation und Vordergrundanzeige ein-/ausschalten, Figur ausblenden, Browser-Studio öffnen oder Companion beenden. Das Infobereich-Symbol holt eine ausgeblendete Figur zurück. Die EXE erneut öffnen bringt die vorhandene Figur und ihr Fenster zurück; es wird keine zweite Desktopfigur gestartet. Während Download/Aufnahme blendet sich die Figur mitsamt Fenster aus und erscheint nach Abschluss wieder. Das verhindert, dass sie mit aufgenommen wird.

Das Einstellungsfenster verwendet Microsoft WebView2 für die vorhandene lokale Oberfläche, einschließlich „Erweitert“. Der SDK ist im geprüften kleinen Update enthalten; die Evergreen Runtime muss auf Windows vorhanden sein. Wenn sie fehlt, bleibt die Figur verfügbar und zeigt einen Hinweis mit Browser-Alternative und offiziellem Microsoft-Download im Rechtsklick-Menü. Es wird kein Runtime-Installer stillschweigend ausgeführt.

WebView2 ist auf die lokale Companion-Adresse beschränkt. Externe zugelassene HTTPS-Links öffnen den Standardbrowser; andere Navigation und Berechtigungsanfragen werden abgelehnt. Es gibt keine WebView-Hostobjekte, kein Chat-LLM, keine Bildschirmaufzeichnung oder globalen Maus-/Tastatur-Hooks. Verschieben wird nur während eines Ziehens der Figur verarbeitet.

„Companion beenden“ wartet auf den Abschluss aktiver Aufträge. Das Schließen des Einstellungsfensters klappt es nur ein. Ein gestoppter lokaler Dienst beendet die Desktopfigur ebenfalls; Updates warten beim Ersetzen noch verwendeter Programmdateien kurz auf dieses Ende.

## Holo-Sprechblase (0.8.1)

Das native Desktop-Menü hat eine echte abgerundete Sprechblasenform mit Spitze zur Figur. Der Holo-Look übernimmt Cyan-Kanten, dunkles blaues Glas und Scanlinien vom TecMon-Waffen-Hologramm. Eigene Fensterbuttons ersetzen die Windows-Titelleiste: Minus und X klappen nur die Sprechblase ein, der Bot läuft weiter. Der Kopfbereich lässt sich ziehen. Die Scrollbar, Eingaben, Buttons und der erweiterte Modus verwenden denselben Holo-Stil. Beim Öffnen auf der anderen Seite des Bots wird die Spitze gespiegelt.

## Automatischer Browser-Ablauf (0.9.0)

Nach einmaliger Verbindung: Im Replay Spieler und Szenen wählen, die lokale Aufnahme bestätigen und „In CS2 aufnehmen“ drücken. Ein vorhandener Sharecode lädt die Originaldemo lokal von Valve. Ohne Sharecode übergibt die Webseite ihre bereits geladene, entpackte Demo direkt über Loopback an den Companion (maximal 2 GB, Stücke bis 4 MiB). Keine JSON-Datei und keine lokale Pfadauswahl nötig. Aufnahme, Branding und MP4-Übernahme in die Webseite folgen automatisch. Ein unterbrochener Statusabruf wird wiederholt; das letzte Ergebnis lässt sich im selben Browser-Tab nach Neuladen und erneutem Laden desselben Matches abrufen, solange der Companion-Dienst nicht beendet wurde.

Demo-Übertragungen brauchen die vorhandene Browser-Freigabe und sind an deren Besitzer gebunden. Fremde lokale Pfade oder Programme können nicht vorgegeben werden. Stücke werden auf Größe, Offset, Gesamtlänge und CS2-Dateikopf geprüft. Höchstens vier ausstehende Übertragungen; veraltete Staging-Ordner werden nach 30 Minuten beim nächsten Start einer Übertragung aufgeräumt. Abgebrochene Übertragungen können vom Besitzer verworfen werden. Aufnahmen erfordern weiterhin die ausdrückliche Bestätigung im Browser.

Fertige Videos werden erst nach einem weiteren ausdrücklichen Klick auf YouTube veröffentlicht. Die Webseite bietet Öffentlich (Standard), Nicht gelistet und Privat sowie optionalen Discord-Versand an. Diese Einstellungen ändern keine YouTube-Secrets im Companion; der erhält weiterhin keine Kanal-Zugangsdaten.
