# TecMon Companion

Öffentlicher Quellcode des lokalen Windows-Programms zu [TecMon](https://tecmon.online). Der Companion läuft auf dem eigenen PC und verbindet sich auf Wunsch mit der Webseite:

- **CS2-Highlights in echter Spielgrafik:** Highlight-Aufträge aus dem TecMon-Replay übernehmen, die Demo per Sharecode lokal laden oder direkt aus dem Browser übernehmen, mit der eigenen TecMon-Engine (ab 0.17, Rückfall auf CS Demo Manager) über HLAE aufnehmen, mit Kamerafahrten, Verfolger-Kamera und im Spiel gesetzten Kamerapunkten, mit FFmpeg und TecMon-Branding (Intro, Radar-Rahmen, Spielernamen, Spielerwechsel) zu einer MP4 verarbeiten und an die Webseite zurückgeben. Die Veröffentlichung auf YouTube oder Discord läuft danach über die Webseite.
- **CS2-Rundentipps:** VAC-sichere Hinweise über Valves offizielle Game State Integration, nur mit eigenen Spielerdaten, standardmäßig aus (siehe [Neu in 0.14.0](#neu-in-0140-cs2-rundentipps) und folgende).
- **Tipps aus „Meine Stats“:** Die Webseite schickt auf Wunsch eine Zusammenfassung der eigenen analysierten Matches (`insights-v1`/`insights-v2`). Sie bleibt lokal in `insights.json`.
- **Desktopfigur:** Der TecMon-Bot schwebt als transparente Windows-Figur über dem Desktop, öffnet per Klick Verbindung und Einstellungen und zeigt die Tipps in einer goldenen Holo-Sprechblase.

Der Quellcode steht unter der MIT-Lizenz. Beiträge, Fehlerberichte und Sicherheitsprüfungen sind willkommen. Dieses Repository enthält ausschließlich den Companion und seine Build-Werkzeuge. Es hat eine neue Git-Historie; der private Website-Code und dessen Historie werden nicht veröffentlicht.

## Sicherheit und Daten

- Keine YouTube-/Google-OAuth-Secrets, Refresh-Tokens, Website-Umgebungsdateien oder persönlichen Installationsdaten werden mitgeliefert. Der Companion benötigt keinen Zugang zum TecMon-YouTube-Kanal.
- Er erzeugt zur Laufzeit lokale Zugangsdaten: ein frei gewähltes PostgreSQL-Administratorpasswort, ein separates generiertes Datenbankkennwort und ein zufälliges Sitzungstoken für die lokale API. Diese Werte sind **keine öffentlichen Repository-Dateien**.
- Datenbank und API binden an `127.0.0.1`. Die API prüft Host, Origin und Sitzungstoken. Ausgewählte Dateien bleiben unter den normalen Windows-Rechten zugänglich.
- Demos, Aufnahme und Kodierung laufen lokal. Veröffentlichung einer MP4 erfolgt separat über die Website. Start der Aufnahme erfordert eine ausdrückliche Bestätigung. Webseiten müssen vorher einmal im lokalen Companion freigegeben werden.
- Die Rundentipps lesen nur, was CS2 selbst per Game State Integration schickt, und nur eigene Spielerdaten. Kein Speicherzugriff, keine Injektion, keine Eingaben an das Spiel, kein Bomben-Timer.

Details, Grenzen und Hinweise für Reviewer: [SECURITY.md](SECURITY.md). Offener Code und bestandene Tests ersetzen kein unabhängiges Sicherheitsaudit.

## Windows herunterladen

Die einfachste Quelle ist [tecmon.online/companion](https://tecmon.online/companion): Die Seite verlinkt automatisch die neueste Version. Im [aktuellen GitHub-Release](https://github.com/KOALAaufPILLEN/tecmon-companion/releases/latest) gibt es zwei getrennte EXE-Dateien:

- **TecMon-Companion-Setup-X.Y.Z.exe**: für neue Nutzer ohne vorhandene Installation. Enthält Companion, Node.js, PostgreSQL und CS Demo Manager. Das Setup lädt HLAE und FFmpeg vom Originalanbieter mit SHA256-Prüfung nach, richtet eine private Datenbank ein und fragt nach einem frei wählbaren Administratorpasswort. Steam und CS2 müssen bereits installiert sein. Internetverbindung erforderlich.
- **TecMon-Companion-Update-X.Y.Z.exe**: für bereits eingerichtete Installationen. Ersetzt nur Companion-Programmdateien und erhält Datenbank, Kennwörter, Tools, Demos, Videos und Einstellungen. Ab 0.17.1 installiert ein laufender Companion neue Versionen automatisch (abschaltbar unter „Erweitert → Updates & Info“); sonst per „Auf Updates prüfen“.

Feste Links auf die jeweils neueste Version: [Setup](https://github.com/KOALAaufPILLEN/tecmon-companion/releases/latest/download/TecMon-Companion-Setup.exe) und [Update](https://github.com/KOALAaufPILLEN/tecmon-companion/releases/latest/download/TecMon-Companion-Update.exe). Der Release-Workflow lädt dafür zusätzlich Kopien ohne Versionsnummer hoch (seit 0.16.1; ältere Releases haben nur die Dateien mit Versionsnummer); Prüfsummen und Update-Manifest beziehen sich weiter auf die Dateien mit Versionsnummer.

Vor Installation oder Update den Companion und CS Demo Manager schließen. Die Prüfsumme des Installers steht neben der EXE als `.sha256`; das Update hat ein eigenes JSON-Manifest und `SHA256SUMS.txt`. WebView2 Evergreen Runtime muss vorhanden sein; siehe [Build- und Laufzeitvoraussetzungen](BUILDING.md).

## Aus Quellcode starten

Node.js ab Version 24; Steam und CS2 für echte Aufnahmen. Die Laufzeit selbst hat keine npm-Abhängigkeiten. Die Entwicklungsabhängigkeit TypeScript wird nur zum Erzeugen der CSDM-Konfigurationsvorlage benötigt.

```sh
npm ci
npm test
npm start
```

Ohne native Installation startet der Quellmodus das lokale Studio, richtet aber keine vollständige Toolchain ein. Native Dateiauswahldialoge, die Desktopfigur und die verwaltete Datenbank benötigen den Windows-Build. Eine vorhandene kompatible CS-Demo-Manager-/PostgreSQL-Installation kann im Quellmodus verwendet werden.

## Windows-Installer bauen

Siehe [BUILDING.md](BUILDING.md). Alle Launcher-, Installer- und Serverquellen sind enthalten. Drittanbieterpakete werden über die dokumentierten Originalquellen bezogen und mit den hinterlegten SHA256-Werten geprüft. Es sind keine vorkonfigurierten Datenbanken oder fertigen Runtime-Binaries im Repository enthalten.

## Verwendung und aktueller Stand

Siehe [Anleitung](tools/cs2-companion/README.md). Companion starten, einmal mit TecMon im Browser verbinden und im Replay „In CS2 aufnehmen“ wählen. Download oder Demo-Übergabe, Aufnahme, Branding und MP4-Rückgabe laufen automatisch. JSON-Import und manuelle Dateiauswahl bleiben unter „Erweitert“ als Alternative verfügbar.

Die Webseite prüft vor jeder Funktion, was der Companion unter `/bridge/state` meldet. Aktuell sind das `browser-demo-v1`, `xray-v1`, `insights-v1` und `insights-v2`; mit verwalteter Installation zusätzlich `video-branding-v1`, `camera-points-v1` und `recorder-internal-v1`, und solange die eigene Engine eingeschaltet ist `camera-script-v1`, `camera-session-v1` und `camera-angle-v1`.

Aufgenommen werden Spieler-Egoansichten, feste Freecam-Punkte und mit der eigenen Engine auch Kamerafahrten über bis zu 8 Punkte oder eine Verfolger-Kamera, bei normalem Tempo mit Spielton ohne Voicechat, X-Ray standardmäßig an. Die eigene Engine braucht für Download und Aufnahme weder CS Demo Manager noch PostgreSQL; beide bleiben vorerst als Rückfall installiert. Browser-Kameras, automatische Killcam, Zeitlupe, Musik und Web-Overlays werden nicht übertragen. Maximal 40 Szenen / 20 Minuten pro Auftrag. HLAE ausschließlich für Demo-Aufnahmen einsetzen; Steam und CS2 werden nicht mitgeliefert.

84 automatisierte Companion-Tests sind enthalten (`npm test`), darunter die Prüfung, dass die Rundentipps keine verbotenen GSI-Blöcke anfordern. Eine isolierte Windows-Einrichtung wird bei jedem Release mit PostgreSQL-Anmeldung, Sonderzeichen-Passwort, CSDM-Tabellenmigrationen, FFmpeg und nativem Launcher getestet. Diese Tests sind kein Nachweis einer vollständigen Aufnahme jeder Demo oder jeder CS2-Version. Ein realer Test auf CS2 1.41.9.6 erzeugte eine 2-Sekunden-MP4 sowie einen zusammengesetzten Clip aus zwei Spieleransichten mit dem korrigierten offiziellen CS2-Plugin.

## Lizenzen und Herkunft

Der ursprüngliche Companion wurde als eigenständiger Quell-Snapshot aus TecMon extrahiert. Die erste öffentliche Historie enthält nur die ausgewählten Companion-Dateien, keine Website-Commits. Das TecMon-Logo dient zur Kennzeichnung; die Lizenz gewährt keine Markenrechte.

Drittanbieter behalten ihre eigenen Lizenzen, einschließlich MIT, PostgreSQL License und GPL. Siehe [THIRD-PARTY-NOTICES.txt](tools/cs2-companion/windows/THIRD-PARTY-NOTICES.txt) und [dependency-manifest.json](tools/cs2-companion/windows/dependency-manifest.json). Diese MIT-Lizenz ersetzt keine Lizenz der gebündelten Drittanbieter. Wer Binärpakete weitergibt, muss deren jeweilige Lizenz- und Quellcodepflichten erfüllen. Dieses Repository veröffentlicht den Companion-Quellcode, die Build-Skripte und kleine Programm-Updates. Ein selbst gebauter Installer enthält Node.js, PostgreSQL und CS Demo Manager mit ihren Lizenzen; HLAE und FFmpeg lädt er bei Bedarf direkt von den Originalanbietern herunter. boiler-writter (MIT) lädt der Companion beim ersten eigenen Download vom npm-Paket und prüft dessen feste Prüfsumme. Radarbilder werden nicht mitgeliefert, sondern lokal aus CS Demo Manager gelesen.

## Versionsverlauf

Neueste Version zuerst.

### Neu in 0.32.4: Augenbrauen und Augenfarben

- Die Augen der Figur haben Brauen, eine feine Kontur, einen hellen Kern und
  zwei Glanzpunkte.
- Jeder Ausdruck hat seine Farbe: fertig golden, böse rot, traurig blau, beim
  Arbeiten cyan, verliebt pink, schwindelig grün, verwirrt orange, müde lila.

### Neu in 0.32.3: Animierte Augen

- Während ein Video entsteht, dreht sich neben den Augen ein Lade-Ring, die Punkte
  laufen mit und der Blick wandert leicht (4 Einzelbilder, wie ein GIF).
- Im Leerlauf schaut die Figur ab und zu ruhig nach links und rechts.

### Neu in 0.32.2: Neue Augen für die Figur

- Die Figur hat ruhige, leuchtende Roboter-Augen statt der bisherigen
  Holo-Gesichter: abgerundete Visier-Augen mit leicht gesenktem Lid, kleiner Mund.
  Beim Video-Erstellen schaut sie konzentriert mit Lade-Ring, fertig mit Sternenaugen.

### Neu in 0.32.1: Figur sagt, was sie gerade am Video macht

- Während ein Video entsteht, zeigt die Figur eine Sprechblase mit dem aktuellen
  Schritt, etwa „Aktuell arbeite ich am Video-Branding, das dauert kurz …“
  (Download, Vorbereitung, Aufnahme, Branding, fertig). Die Blase bleibt stehen,
  bis der nächste Schritt kommt; ein Klick blendet sie aus. Sie nimmt CS2 nie
  den Fokus.

### Neu in 0.32.0: Messer und Handschuhe im Skin-Tausch (Versuch)

- Mit eingeschaltetem Skin-Tausch meldet der Companion `skin-swap-v2`: Auf
  tecmon.online lassen sich je Szene auch ein Messer (Modell und Skin) und
  Handschuhe wählen. Der Rewriter ersetzt dafür die Standard-Messer und
  -Handschuhe beider Seiten in der Demo-Kopie; ein eigenes Messer aus der Demo
  wird mit ersetzt. Für Messer liest er die Modelle aus der installierten CS2
  (`game/csgo`). Versuchsfunktion: bitte im fertigen Video prüfen.
- Agenten-Skins kann der Rewriter nicht tauschen.

### Neu in 0.31.1: Skin-Tausch von der Webseite einschalten

- Der Skin-Tausch lässt sich jetzt auch direkt auf tecmon.online im Demo-Manager
  einschalten (Capability `skin-swap-setup-v1`, `GET/POST /bridge/skins`). Den
  Hinweis bestätigst du dort genauso wie auf der Companion-Seite.

### Neu in 0.31.0: Skin-Tausch für Videos (Zusatz-Addon)

- **Skin-Tausch** (Companion-Seite → Spiele → „Skin-Tausch für Videos“): zeigt in
  einer Video-Szene einen anderen Waffenskin. Auf tecmon.online trägst du im
  Demo-Manager je Szene Waffe, Skin-ID, Abnutzung und Muster ein. Vor der Aufnahme
  schreibt der Companion eine Kopie der Demo um und nimmt daraus auf; die
  Original-Demo bleibt unverändert, nichts läuft im Spiel oder im Live-Match.
- Standardmäßig aus, Einschalten nach bestätigtem Hinweis. Getauschte Waffen tragen
  das Namensschild „TecMon Skin“, damit niemand den Skin für echten Besitz hält.
- **Credits:** Der Demo-Rewriter stammt aus
  [CS2-nskinz von Lyan-edit](https://github.com/Lyan-edit/CS2-nskinz) (AGPL-3.0).
  Der Companion lädt `nskinz-demo-rewriter.exe` erst beim Einschalten unverändert
  vom festen Stand des Autors (v0.7.4), prüft die SHA-256-Prüfsumme und startet ihn
  als eigenes Programm. Ausschalten löscht ihn wieder. Nach einem CS2-Update kann
  eine neue Version nötig sein.

### Neu in 0.30.0: CFG-Sammlung und Fadenkreuz-Overlay

- **CFG-Sammlung** (Companion-Seite → Spiele → „Fertige CS2-Configs“): fertige
  cfgs zum Speichern mit einem Klick, z. B. Pro-Viewmodel, NiKos Einstellungen,
  alle stumm per Taste, Gegner stumm per Taste, Chat ausblenden, Springen aufs
  Mausrad, Messer in der linken Hand, ohne Musik, Netzwerk-Anzeige, Radar und
  Granaten-Training für den eigenen Server. Tasten für Binds wählst du aus einer
  Liste. Jede cfg ist eine eigene Datei `tecmon_cfg_<name>.cfg`; in CS2 lädst du
  sie einmal mit `exec tecmon_cfg_<name>`. Deine Sensitivity bleibt unverändert.
- **Fadenkreuz-Overlay** (Karte „Dein CS2-Fadenkreuz“): zeigt dein Fadenkreuz als
  eigenes, durchklickbares TecMon-Fenster in der Bildschirmmitte. Standardmäßig aus;
  vor dem Einschalten bestätigst du einen Hinweis (eigenes Risiko, keine Haftung für
  Sperren). Es erscheint nur, wenn CS2 im Vollbild-Fenstermodus vorn liegt, und
  greift nicht in CS2 ein.

### Neu in 0.29.0: Deathcam mit Namen

- **Deathcam-Schriftzug:** Bei einer Deathcam-Aufnahme steht oben mittig
  „DEATHCAM: Name“ des Spielers, der stirbt. Die Webseite schickt vorher immer
  ein kurzes Intro von vorn auf den Sterbenden, danach folgt die Sicht des
  Killers. Der Name kommt nur als gesperrte Textdatei ins Video
  (Capability `deathcam-label-v1`).

### Neu in 0.28.0: Neues Schnellmenü und Fenster mit Reitern

- **Rechtsklick auf die Figur** öffnet ein eigenes TecMon-Schnellmenü statt
  verschachtelter Windows-Menüs: Kacheln für Einstellungen, Highlights, Clip
  speichern, Letzte Videos, Minispiele und TecMon.online, Schalter für
  Highlight-Video nach dem Match, Rundentipps, Clip-Puffer und Figur, dazu die
  Persönlichkeit. Alles Weitere unter „Alle Optionen …“. Esc schließt.
- **Linksklick-Fenster** mit Reitern (Start, Spiele, Clips, TecMon, Pakete)
  statt einer langen Liste. Sprünge aus dem Menü öffnen den passenden Reiter.

#### Mehr Persönlichkeit

- Neue Sprüche je Modus, eigene Sprüche zu Waffen in den Spray-Tipps und zu
  Quiz und Preisfrage (direkt unter dem Ergebnis). Gleiche Sprüche kommen nicht
  direkt hintereinander.
- **HUAN-Modus ab 18:** derber Trashtalk über dein eigenes Spiel, ohne
  Beleidigungen von Menschen. Vor dem Einschalten fragt TecMon einmal nach.
- Ab und zu ein Spruch, wenn du gerade nicht spielst. Läuft CS2 oder Dota 2 im
  Vordergrund oder eine Aufnahme, bleibt TecMon still.
- Neue Spray-Hinweise für P90, SSG 08 und Negev, Kartentipps für Anubis und
  Vertigo.
- Im Menü „Alle Optionen …“ bleiben Untermenüs bei Schaltern offen, „Companion
  beenden“ ist rot markiert.

#### Update-Knopf mit Rückmeldung

- Nach „Ja“ beim Update zeigt die Figur „Update wird geladen …“ und danach das
  Ergebnis oder den Fehler, statt still zu bleiben.
- Jeder Update-Schritt und jeder Fehler steht im Protokoll
  (`%LOCALAPPDATA%\TecMon\Logs\companion.log`). Die Statusabfrage der Datenbank
  hat ein Zeitlimit, damit das Update nicht hängen bleibt.
- Update und Beenden funktionieren auch, wenn PostgreSQL oder CS Demo Manager
  vom PC entfernt wurden. Die eigene TecMon-Engine braucht beides nicht.

### Neu in 0.27.0: Frage schon im Hauptmenü, Menü mit Buttons

- **Highlight-Frage direkt nach dem Match:** Ist „Nach dem Match Highlight-Video
  anbieten“ an, fragt TecMon jetzt schon, sobald du nach einem fertigen Match
  wieder im CS2-Hauptmenü bist. Die Frage ist ein eigenes TecMon-Fenster unten
  rechts mit „Ja, Video erstellen“ und „Nein“ und nimmt CS2 keinen Fokus. Nach
  „Ja“ lädt der Companion die Demo, sobald du CS2 schließt.
- **Prüfanzeige:** Die Companion-Seite zeigt unter „Nach dem Match“, wann zuletzt
  Daten von CS2 kamen und welches Match erkannt wurde. Kommt nichts an, CS2 nach
  dem Einschalten einmal neu starten.
- **Figurmenü und Companion-Seite im TecMon-Stil:** Menüeinträge sehen aus wie
  Buttons und geben beim Klick sichtbar nach, Hover nur mit Maus, Esc schließt
  Rückfragen.

### Neu in 0.26.1: Kein „401 Nicht autorisiert“ nach Updates

- Startet der lokale Dienst neu, etwa nach einem automatischen Update, holt sich
  die Figur den neuen Sitzungsschlüssel selbst und wiederholt die Aktion. Die
  Companion-Seite im Fenster lädt sich dabei einmal neu.

### Neu in 0.26.0: Highlight-Video nach dem Match

- **Automatisches Highlight-Video** (Capability `auto-highlights-v1`, standardmäßig
  aus): Rechtsklick auf die Figur → Games → CS2 → „Nach dem Match Highlight-Video
  anbieten“ oder auf der Companion-Seite einschalten. Nach einem fertig gespielten
  Premier-, Wettkampf- oder Wingman-Match prüft der Companion, sobald eine Minute
  lang keine Spieldaten mehr kommen, ob `cs2.exe` noch läuft (danach jede Minute).
  Ist CS2 zu, fragt die Figur: „Neues Highlight-Video erstellen?“
- Bei „Ja“ holt der Companion die Demo deines letzten Matches über dein Steam,
  **ohne Sharecode**, und öffnet die TecMon-Seite. Sie wählt deine besten Szenen,
  startet die Aufnahme mit deinem zuletzt benutzten Stil und lädt das fertige Video
  zu YouTube hoch und postet es in Discord, wenn beides im Browser eingerichtet ist.
- Genutzt werden nur Map, Modus, Matchphase und die eigene SteamID aus der
  offiziellen CS2-Schnittstelle. Die Funktion legt dieselbe GSI-Datei an wie die
  Rundentipps und entfernt sie beim Ausschalten wieder, wenn die Tipps aus sind.

### Neu in 0.25.0: Animiertes Overlay, Filter und bessere Bildqualität

- **Animiertes Gameplay-Overlay (HUD v2):** Der Rahmen oben liegt eng an den
  Spielerbildern und umfasst jetzt auch die Waffenzeile. Kräftigere Farben und
  dickere Linien mit Leuchten; die Farben wechseln langsam zwischen Cyan und Lila,
  sonst bewegt sich nichts. Kommt aus dem Video-Paket `TecMon-Motion-v4.json`
  (feste Prüfsummen); ohne Paket bleibt das bisherige Overlay.
- **Kill-Anzeige im Video** (Capability `kill-badge-v1`): links neben dem TecMon-Logo
  erscheint bei jedem Kill des Szenen-Spielers ein Tab in derselben Form wie das Logo:
  „1K · KILL“, „2K · DOUBLE KILL“ bis „ACE · ALL 5 ENEMIES“ (englisch), mit „HEADSHOT“. Die Webseite schickt nur Ticks und Zahlen, die Wörter stehen fest im Companion.
- **36 voreingestellte Filter** (Capability `video-filter-v1`): je Szene ein
  Filter nur auf das Gameplay, das Overlay bleibt unverändert. Optional ein eigener
  Filter für Intro, Titelbild, Spielerwechsel und Outro. Die Webseite schickt nur
  die Kennung, die Filterketten stehen fest im Companion.
- **Bessere Bildqualität:** Aufnahme mit CRF 16, Zwischenschritte mit CRF 16
  (`fast`), Endmontage mit CRF 17 (`medium`). Alle Videos tragen ihren Farbraum
  (BT.601-Matrix), damit YouTube die Farben nicht blasser umrechnet.

### Neu in 0.24.0: Esport-Titelbild und Esport-Spielerwechsel

- **Animiertes Esport-Titelbild:** Nach dem TecMon-Intro schlagen Seitenpaneele
  und ein goldenes Banner ein, das Logo fällt oben hinein. In der Mitte des
  Banners stehen Titel bzw. Spielername, darüber die Map, darunter die Spieler.
  Dahinter läuft das Sternennetz der Webseite. Danach wischt das Bild als
  schräger Streifen nach links weg, dunkellila und goldene Streifen folgen und
  geben das Gameplay frei (3,8 s, darunter steht das erste Bild der ersten Szene).
- **Neuer Spielerwechsel ohne Figur:** Drei schräge Paneele (Gold, Dunkellila, Navy)
  wischen über das Bild, in der Mitte erscheint der nächste Spieler, dann wischen
  sie wieder heraus (2,8 s). Gilt für beide Video-Stile. Beide Clips sind
  programmiert, vor Greenscreen gerendert und werden ohne grüne Ränder freigestellt.
- **Neues Video-Paket `TecMon-Motion-v2.json`** mit neuen festen Prüfsummen; das
  alte v1-Paket wird aus dem Branding-Ordner gelöscht.

### Neu in 0.23.0: Animiertes Intro, Spielerwechsel und Outro

- **Neues TecMon-Intro im Highlight-Video:** TecMon schwebt ins neblige
  Neon-Raster, scannt mit lila Strahl, das goldene Logo baut sich auf und er
  zwinkert (6,5 s). Danach die Titelkarte mit Spielern und Map (2,5 s, ab 0.24.0 Esport-Titelbild).
- **Zwei Video-Stile zur Auswahl:** „Neon-Raster“ (A) und „Hologramm“ (B, TecMon
  fliegt durch einen Lichttunnel und projiziert das Logo als Hologramm). Die
  Webseite wählt per `branding.style` (`"a"`/`"b"`) im Auftrag, sobald der
  Companion `video-style-v1` meldet; ohne Angabe gilt A.
- **Neuer Spielerwechsel im Teamvideo:** vor Greenscreen erzeugt und über das
  Gameplay gelegt. A: Lichtspur mit Partikeln, B: TecMon fliegt auf die Kamera
  zu. Darin erscheint der Name des nächsten Spielers.
- **Animiertes Outro:** TecMon winkt und fliegt davon, das Logo bleibt stehen,
  darunter Website und Kanal, dann Abblende.
- **Weiche Übergänge statt harter Schnitte:** Intro, Titelkarte, Szenen,
  Spielerwechsel und Outro werden ineinander überblendet (0,3–0,5 s, Bild und
  Ton). Dafür wird das fertige Video einmal neu kodiert. Ohne Video-Paket bleibt
  die bisherige Montage.
- **Geprüft wie das übrige Branding:** Alle Videos kommen als eigenes Paket
  `TecMon-Motion-v1.json` (rund 11,5 MB, heute v3) von einer festen Release-Adresse und haben
  feste SHA256-Prüfsummen. Weicht etwas ab, bricht der Auftrag ab. Ist das Paket
  offline nicht erreichbar, nutzt der Companion das bisherige statische Intro.

### Neu in 0.22.1: Neue Augen für TecMon

- **Neue Gesichter statt LED-Punkten:** Kräftig leuchtende lila Augen und
  Münder für alle 20 Ausdrücke, etwa Herzaugen, Spiralaugen, Sonnenbrille,
  Tränen und rosa Wangen. Dazu kommen Zeichen neben dem Kopf: Zz beim
  Schlafen, Ausrufezeichen beim Staunen, ein Fragezeichen bei Verwirrung,
  Herzen und Funkeln.

### Neu in 0.22.0: Dota-2-Paket

- **Dota 2 ist jetzt ein installierbares Paket** unter „Games“. Es bringt
  Dota-2-Tipps über die offizielle Game State Integration von Valve und gehört
  zur neuen Dota-2-Replay-Seite auf TecMon (Stats und jeder Item-Kauf mit Zeit).
- **Nur eigene Werte:** Die cfg fordert nur `provider`, `map`, `player`, `hero`
  und `items` an. Keine Gebäude, keine Minimap, kein Roshan, keine Kuriere, keine
  Draft- oder Gegnerdaten. Nachrichten mit Daten beider Teams (Zuschauer, Replay)
  werden verworfen.
- **Nur in Pausen:** vor dem Horn, in Spielpausen, nach deinem Tod und am
  Matchende. Solange du lebst und das Spiel läuft, ist TecMon still. Höchstens
  drei Tipps je Pause. Inhalte: Last-Hit-Tempo, Gold für Buyback ab Minute 25,
  beim Tod noch bereite aktive Items, nicht ausgegebenes Gold, Match-Bilanz.
  Jede Tippart lässt sich einzeln abschalten.
- **Standardmäßig aus**, mit eigenem Token. Die cfg landet in
  `dota 2 beta\game\dota\cfg\gamestate_integration` und wird beim Ausschalten
  oder Entfernen des Pakets gelöscht. Dota 2 braucht dafür in Steam die
  Startoption `-gamestateintegration`.

### Neu in 0.21.0: Clip-Puffer für alle Spiele

- **Die letzten Sekunden als Clip:** Im Fenster unter „Clips“ oder per
  Rechtsklick „Clips → Clip-Puffer eingeschaltet“ nimmt TecMon den Bildschirm
  laufend auf und behält nur die letzten 10 bis 120 Sekunden.
  **Strg+Alt+C** speichert sie als Clip. Das funktioniert in jedem Spiel.
- **Kein Eingriff ins Spiel:** FFmpeg liest nur das Windows-Bild (Desktop
  Duplication, wie OBS). Kein Hook, keine Injektion, kein Mitlesen der
  Tastatur: Strg+Alt+C ist eine einzelne registrierte Taste. Die Rückmeldung
  kommt als Windows-Hinweis und nimmt dem Spiel nicht den Fokus.
- **Standardmäßig aus:** Der Zwischenspeicher wird beim Ausschalten, beim
  Beenden und beim nächsten Start gelöscht. Gespeicherte Clips liegen im
  Datenordner unter `Clips`.
- **Grafikkarte zuerst:** Die Aufnahme versucht NVENC, AMF und Quick Sync und
  nimmt erst danach den Prozessor (x264).
- **Ton optional:** Für Spielton braucht Windows ein Aufnahmegerät wie
  „Stereomix“. Ohne Gerät sind Clips stumm.
- **TecMon-Branding:** „Branding erstellen“ setzt ein kleines Logo an den
  rechten Rand, zeigt Titel und Spiel in den ersten drei Sekunden und hängt
  den Abspann an. Wie beim Highlight-Branding nur mit geprüften Assets.
- **Hochladen auf der Webseite:** Fertige Clips mit Branding holt TecMon.online
  über die Browser-Verbindung (Capability `clips-v1`) und lädt sie zu YouTube
  hoch. Rohclips ohne Branding gibt der Companion nicht heraus.

### Neu in 0.20.0: Spiel-Pakete

- **Du entscheidest, welche Spiele TecMon nutzt:** Unter „Games“ steht jedes
  Spiel als Paket mit „Installieren“ oder „Entfernen“. CS2 ist installiert,
  Valorant, Dota 2 und Wardogs sind als geplant gelistet.
- **Entfernen löscht die Daten des Pakets:** Beim Entfernen von CS2 werden die
  Rundentipps ausgeschaltet und `gamestate_integration_tecmon.cfg`,
  `tecmon_crosshair.cfg`, `crosshair.json` und die übertragenen
  Webseiten-Daten (`insights.json`) gelöscht. Danach legt TecMon für CS2 keine
  Dateien mehr an, und Rundentipps, Fadenkreuz und CS2-Quiz verschwinden aus
  Menüs und Fenster. Wieder installieren geht jederzeit.
- **Aufnahme bleibt:** Die Highlight-Aufnahme für die Webseite gehört zum
  Companion und ist vom Paket nicht betroffen.
- **Rechtsklick:** „Games“ zeigt CS2 oder „CS2 installieren“, die geplanten
  Spiele und „Spiel-Pakete verwalten“.
- **Deadlock** steht als geplantes Paket in der Liste. Deadlock hat keine
  offizielle Schnittstelle für Live-Daten, deshalb gibt es im Companion noch
  keine Rundentipps. Die Replay-Auswertung (Scoreboard, Item-Käufe mit Minute,
  Todeskarte, Laufwege, Stats je Held und Item) läuft schon jetzt auf der
  Webseite im Browser; die Karte im Fenster weist darauf hin.

### Neu in 0.19.1: Spiele mit TecMon und Games-Menü

- **Spiele mit TecMon:** Das Menü heißt jetzt so. Vier neue Spiele kommen
  dazu: Ziele treffen (10 Ziele auf Zeit), Muster merken und Zahl raten.
  Bestwerte werden gemerkt.
- **Games → CS2:** Neues Rechtsklick-Menü für die CS2-Integrationen:
  Highlights aufnehmen, Rundentipps, Fadenkreuz einstellen, Callout-Quiz,
  das neue Waffenpreis-Quiz, letzte Videos und den Videos-Ordner. Alles, was zu
  CS2 gehört, steht nur noch dort. Weitere Spiele sind geplant. Im
  Linksklick-Fenster stehen diese Karten gesammelt unter „Games · CS2“.

### Neu in 0.19.0: Persönlichkeit, TecMon-Werte, Interaktionen und Spiele

- **Vier Persönlichkeiten:** Super nett, Normal, Nerdy und HUAN-Modus
  (frech und gemein). Umschaltbar im Rechtsklick-Menü unter „Persönlichkeit“
  und in der Karte „Dein TecMon“. Der Modus färbt auch die CS2-Rundentipps:
  Inhalt und Zeitpunkte bleiben gleich, nur der Ton ändert sich. Der
  HUAN-Modus stichelt nur über das eigene Spiel, nie über Personen.
- **TecMon-Werte:** Level und Erfahrung, Laune, Energie und Freundschaft.
  Energie und Laune sinken langsam mit der Zeit; Schlafen lädt Energie auf.
  Gespeichert lokal in `pet.json`.
- **Mit TecMon spielen:** Anstupsen, Witz, Kompliment, Trick (er dreht sich
  einmal im Kreis), Schlafen schicken und Aufwecken. Er antwortet in der
  Sprechblase mit passendem LED-Gesicht.
- **Spiele:** Reaktionstest, Schere-Stein-Papier und ein Callout-Quiz zu den
  CS2-Karten. Gewinnen gibt Erfahrung und gute Laune; Bestwerte werden gemerkt.
- **Menüs:** Rechtsklick hat die neuen Untermenüs „TecMon“, „Spiele“ und
  „Persönlichkeit“. Ein Spiel oder „Werte anzeigen“ öffnet das
  Linksklick-Fenster direkt an der richtigen Stelle.

### Neu in 0.18.3: Fadenkreuz-Editor, Linksklick-Fenster wie die Sprechblase, Figur bei Aufnahme sichtbar

- **Drehung ohne Schleier:** Die Überblendung zwischen zwei Blickwinkeln ist
  entfernt, weil sie einen Schleier nachzog. TecMon dreht sich jetzt schneller
  und springt sauber zwischen den 72 Blickwinkeln.
- **Fadenkreuz-Editor:** Neue Karte „Fadenkreuz“ mit Vorschau, Vorlagen,
  Länge, Abstand, Dicke, Umriss, Farbe, Punkt und T-Form. Ein vorhandener
  CS2-Fadenkreuz-Code (CSGO-…) lässt sich übernehmen. „In CS2 speichern“
  schreibt `tecmon_crosshair.cfg` in den CS2-cfg-Ordner; in CS2 einmal
  `exec tecmon_crosshair` in die Konsole tippen. Es ändert nur das CS2-eigene
  Fadenkreuz, es gibt kein Overlay über dem Spiel.
- **Linksklick-Fenster:** Gleiche Form wie die Rundentipp-Sprechblase
  (abgeschrägte Ecken, goldener Rahmen) mit dem umlaufenden lila Lichtstreifen.
  Es gleitet beim Öffnen kurz aus der Figur heraus, die Spitze zeigt immer
  auf TecMon, und wer das Fenster am Kopf verschiebt, nimmt die Figur mit.
- **Bei Aufnahme sichtbar:** Während einer Aufnahme oder eines Downloads bleibt TecMon auf dem Desktop
  sichtbar und schwebt mit dem „Arbeitet“-Gesicht. Hinter CS2 tritt er nur,
  solange das CS2-Fenster vorn liegt. Er läuft dabei mit etwa 20 Bildern pro
  Sekunde und fliegt nicht umher, damit die Aufnahme genug Rechenzeit hat.

### Neu in 0.18.2: Hellere Figur, 20 LED-Gesichter, flüssigere Drehung, Menü im TecMon-Stil

- **Heller:** Die 3D-Figur ist mit Umgebungslicht neu gerendert, auf einer
  mittleren Helligkeit: Gold und Metall sind gut erkennbar, ohne zu überstrahlen.
- **20 LED-Gesichter:** Hohe, runde LED-Augen, Blinzeln, Freude, Sprechen,
  dazu Zwinkern, Staunen, Herzaugen, Sternaugen, Lachen, Kuss, Zunge, Sonnenbrille,
  verwirrt, traurig, wütend, schwindelig und Schlafen. Beide Augen sitzen jetzt
  exakt auf gleicher Höhe (das Gesicht lag im Modell leicht schräg). Das alte,
  ins Modell eingeformte Lächeln und ein Leuchtpunkt am Kinn sind entfernt.
- **Ausdrücke im Alltag:** Ab und zu ein Zwinkern oder Herzaugen, wenn TecMon
  nichts zu tun hat; nach drei Minuten ohne Aktivität schläft er ein. Vor einem
  Tipp staunt er kurz, nach einem Tipp zum eigenen Tod schaut er mitfühlend,
  nach Lob mit Sternaugen.
- **Flüssigere Drehung:** Doppelt so viele Blickwinkel (alle 5°) und weiches
  Überblenden dazwischen. Die Einzelbilder werden beim Start einmal
  ausgeschnitten und das Fensterbild wiederverwendet; das spart Rechenzeit.
- **Menü:** Das Rechtsklick-Menü der Figur (und das Tray-Menü) hat den Look der
  Rundentipp-Sprechblase: dunkle Fläche, goldener Rahmen, lila Auswahl.
- **Linksklick-Fenster aufgeräumt:** Gleicher Stil wie Sprechblase und Menü.
  Kompakter Kopf, kürzere Karten; „Companion beenden“ und Hinweise stehen im
  Rechtsklick-Menü bzw. unter „Erweitert“.

### Neu in 0.18.1: Aufnahme nach dem CS2-Update repariert

Seit dem CS2-Update vom 11.11.2026 stürzte CS2 bei jeder Aufnahme etwa 14
Sekunden nach dem Start ab. Der Absturzbericht zeigt die Ursache im
CS2-Aufnahme-Plugin (Build vom 3.11.). Der Companion nutzt jetzt den
offiziellen Upstream-Build `3ba51c9d`, der nach dem Update neu gebaut wurde,
wieder mit fester SHA-256-Prüfsumme. Stürzt CS2 während einer Aufnahme ab,
nennt das Aufnahme-Protokoll das jetzt direkt mit dem Namen des
Absturzberichts statt nur „keine Rohaufnahme“.

### Neu in 0.18.0: 3D-TecMon mit LED-Gesicht

- **Neue 3D-Figur:** Der TecMon auf dem Desktop ist jetzt das 3D-Modell. Es
  wurde vorab in 36 Drehwinkeln gerendert, die Figur dreht sich darum rundum
  ohne 3D-Grafik im Companion. Fehlt das Bild, erscheint die bisherige Figur.
- **LED-Gesicht:** Das gemalte Gesicht ist durch eine LED-Punktmatrix ersetzt
  (normal, blinzeln, lächeln, sprechen, Aufnahme).
- **Flüssiger:** etwa 60 Bilder pro Sekunde, Bewegung nach Zeit statt pro
  Takt, weiches Schweben, Wiegen und gedämpftes Drehen.
- **In der Runde:** Läuft die Runde und du lebst (Rundentipps an), dreht sich
  die Figur zum Spiel und kehrt dir den Rücken zu. Kommt ein Tipp, dreht sie
  sich zu dir um, die Sprechblase erscheint und der LED-Mund spricht.
- **Freigestellte Sprechblase:** Die Sprechblase ist jetzt ein Fenster mit
  echter Transparenz je Pixel. Der dunkle Rand um Rahmen und Spitze ist weg,
  der lila Schein läuft weich aus. Sie nimmt CS2 weiterhin nie den Fokus.

### Neu in 0.17.3: Update aus dem Companion heraus funktioniert

Beim Update über den Knopf oder automatisch schloss sich der Companion, ohne
zu aktualisieren, und musste von Hand neu gestartet werden. Ursache: Der
Updater wurde als Kindprozess des lokalen Dienstes gestartet, und Windows
beendete ihn zusammen mit dem Dienst, auf dessen Ende er gerade wartete. Der
Updater läuft jetzt losgelöst, ersetzt die Programmdateien und startet den
Companion danach wieder.

Wichtig: Der Fehler steckt in den installierten Versionen bis 0.17.2. Auf
0.17.3 darum einmal mit der Update-EXE von der Release-Seite aktualisieren
(Doppelklick). Ab 0.17.3 klappen Updates aus dem Companion heraus.

## Neu in 0.17.2: Fehlerbehebung Video-Übernahme

Mit der eigenen TecMon-Engine kam die fertige MP4 nicht auf die Webseite
(„The "path" argument must be of type string“). Das Video wurde aufgenommen,
aber die Webseite konnte es nicht abholen. Jetzt klappt die Übernahme mit
beiden Engines. Bereits aufgenommene Videos liegen weiter im Datenordner unter
`Jobs` und erscheinen im Companion unter den letzten Videos.

### Neu in 0.17.1: Automatische Updates

- Der Companion sucht zwei Minuten nach dem Start und danach alle sechs Stunden nach einem neuen stabilen Release. Ein gefundenes Update wird mit denselben Prüfungen wie beim Klick (Manifest, Größe, SHA-256) selbst installiert, danach startet der Companion neu.
- Nie während eines Downloads, einer Aufnahme oder „Kamera im Spiel setzen“; dann beim nächsten Durchgang.
- Abschaltbar unter „Erweitert → Updates & Info“ (gespeichert in `updates.json`). Ausgeschaltet bleibt es beim Hinweis mit Klick.
- Von 0.17.0 auf 0.17.1 muss das Update noch einmal per Klick installiert werden, ab dann geht es automatisch.

### Neu in 0.17.0: Eigene TecMon-Engine (Vorschau)

- **Download ohne CS Demo Manager:** Sharecodes löst der Companion jetzt selbst über dein angemeldetes Steam auf (boiler-writter, MIT, beim ersten Download vom npm-Paket geladen und gegen die feste SHA-512-Prüfsumme geprüft). Die Demo kommt direkt von Valve und wird lokal entpackt.
- **Aufnahme ohne CS Demo Manager und ohne Datenbank:** Der Companion schreibt den Aufnahmeplan für das offizielle CS2-Plugin selbst, hängt das SHA-256-geprüfte Plugin nur für die Aufnahme ein, startet CS2 über HLAE und führt die Szenen mit FFmpeg zusammen. PostgreSQL startet dafür nicht.
- Die Befehlsfolge entspricht CS Demo Manager 3.20.1 (MIT). Spieler-Slots, Tickrate und Kamerapunkte kommen aus dem Auftrag der Webseite; dafür muss die Webseite den Slot mitschicken.
- **Rückfall:** Aufträge ohne Spieler-Slots (ältere Webseite) laufen automatisch weiter über CS Demo Manager. Schlägt der eigene Download fehl, übernimmt CS Demo Manager. Unter „Erweitert → Setup“ lässt sich die eigene Engine ganz abschalten.
- Läuft CS2 schon, bricht die Aufnahme ab, statt das Spiel zu beenden. Nach der Aufnahme wird nur die eigene Zeile aus `gameinfo.gi` entfernt, nicht eine alte Sicherung zurückgespielt.
- CS Demo Manager und PostgreSQL bleiben in diesem Release installiert. Sie werden erst entfernt, wenn die eigene Engine auf echten PCs geprüft ist.
- **Kamerafahrten und Verfolger-Kamera:** Ein TecMon-Skript für HLAE (`mirv_script_load`, ab HLAE 2.190) setzt die Kamera in jedem Bild. Eine Szene kann weich über bis zu 8 Punkte fahren oder dem Spieler mit Abstand, Höhe und optionalem Kreisen folgen. Der Plan im Skript besteht nur aus geprüften Zahlen des Auftrags. Über CS Demo Manager wird daraus ein fester Punkt bzw. die Egoansicht.
- **Spieler-Intro von vorn:** Die Verfolger-Kamera kann mit einem Startwinkel beginnen, etwa 180° für eine Kamera vor dem Gesicht des Spielers. Die Webseite nutzt das für ein kurzes Intro je Spieler (Capability `camera-angle-v1`). Das Modell und die Skins kommen in CS2 aus der Demo und lassen sich dort nicht tauschen.
- **Kamera im Spiel setzen:** Die Webseite kann CS2 mit der Demo am gewählten Zeitpunkt öffnen lassen. Mit der HLAE-Freikamera fliegen (WASD, R/F hoch/runter, Pfeiltasten schauen) und mit F8 Punkte merken. Nach dem Schließen von CS2 gehen die Punkte an die Webseite. Läuft mit eigenem CS2-Konfigurationsordner, deine Tastenbelegung bleibt unverändert; eine vorhandene `console.log` wird nur gelesen.
- Schon geladene Valve-Demos desselben Matches nutzt der Companion wieder, statt sie erneut zu laden.

### Neu in 0.16.1: Sprechblase im TecMon-Gold-Stil

- Die Sprechblase hat jetzt einen goldenen Rahmen mit abgeschrägten Ecken und einer Spitze zur Figur, eine dunkle Fläche, oben „TecMon“ in Gold mit Schließen-Kreuz und darunter die Tipp-Art mit farbigem Punkt.
- Ein lila Lichtstreifen läuft etwa alle drei Sekunden einmal um den Rahmen, solange die Sprechblase sichtbar ist. Außen liegt ein leichter lila Schein.
- Gestapelte Tipps derselben Runde stehen darunter, kleiner und mit eigener Überschrift.

### Neu in 0.16.0: Tipps aus deinen Demo-Stats und große Sprechblase

- **Mehr aus deinen Matches:** Ist der Companion verbunden, schickt „Meine Stats“ auf der Webseite jetzt zusätzlich deine eigenen Werte pro Map als Summen mit (Capability `insights-v2`): Eröffnungsduelle, getradete Tode, K/D je Seite, Zeit ohne Mitspieler in der Nähe, Bombe verloren und Solo-Plants, Schüsse aus der Bewegung, Kopftreffer, Granaten pro Runde, ungenutzte Granaten beim Tod, Team-, Gegner- und Selbst-Flashes, Flash-Assists, Teamschaden, Schaden pro Runde, Clutches, Runden mit 3+ Kills, Kills nach gewonnenen oder verlorenen Runden sowie Trefferquote und Headshots deiner 8 meistgenutzten Waffen. Daten anderer Spieler gehen nicht mit. Alles bleibt lokal in `insights.json`.
- **Über 20 neue Tipps:** Zu Beginn jeder Seite passt der erste Tipp zur Hälfte, die gerade beginnt (zum Beispiel „Als T liegt deine K/D bei 0,57, als CT bei 1,14 …“, „Mit der Bombe bist du in 8 von 20 Runden gestorben, ohne zu planten …“ oder als CT „Mit der M4A1-S triffst du 30 %, mit der M4A4 nur 18 %. Kauf dir lieber die M4A1-S.“). Danach kommen Gewohnheiten wie verlorene Eröffnungsduelle, wenig getradete Tode, Laufschüsse, niedrige Kopftrefferquote, AWP-Treffer, ungenutzte Granaten, Team- und Selbst-Flashes, Teamschaden und Tilt nach verlorenen Runden. Stärken werden gelobt: Clutches, Entry, Flash-Assists, hoher Schaden, Multi-Kills, Headshot-Quote einer Waffe. Etwa jede vierte Runde kann in der Kaufzeit eine weitere Erinnerung dazukommen. Jeder Tipp kommt höchstens einmal pro Match und erst bei genug Daten (zum Beispiel mindestens 10 Eröffnungsduelle oder 300 Schüsse). Hat eine Map zu wenige Matches, zählen alle Maps zusammen.
- **Spray-Tipp mit deiner Trefferquote:** Beim Waffenkauf steht unter dem Spray-Muster jetzt auch, wie oft du mit dieser Waffe triffst und wie viele deiner Kills damit Headshots sind.
- **Große Sprechblase:** Tipps derselben Runde sammeln sich in einer breiteren Sprechblase (bis zu 4, der neueste oben, ältere etwas gedimmt) statt sich gegenseitig zu ersetzen. Abschaltbar unter „Mehrere Tipps zusammen in einer großen Sprechblase“.
- Abschaltbar wie bisher über „Tipps aus deinen TecMon-Matches“. Ältere Webseiten schicken weiter `insights-v1`, das funktioniert unverändert.

### Neu in 0.15.0: Rundentipps mit Bildern

- **Spray-Muster beim Waffenkauf:** Kaufst du ein Gewehr oder eine SMG, zeigt die Sprechblase das Einschlagmuster der Waffe (Schuss 1, 10, 20, 30 markiert) und beschreibt, in welche Richtung du die Maus ziehen musst. Die Muster stammen aus dem Recoil Lab der Webseite (`spray-patterns.mjs`).
- **Map-Übersicht zu Beginn jeder Halbzeit:** Für Mirage, Dust II, Inferno und Ancient gibt es eine Radarkarte mit Bombenplätzen, Spawns und den bekanntesten Callouts. Die für deine Seite wichtigsten Spots sind gold markiert. Das Radarbild liest der Companion lokal aus der mitinstallierten CS-Demo-Manager-Version. Ohne dieses Bild erscheint nur der Text.
- **Neue Tipps:** früher Tod in den ersten 20 Sekunden, Lob für Runden mit 3 oder mehr Kills, genauere Spray-Beschreibungen.
- **Ruhig, sobald die Runde läuft:** Alle Hinweise kommen jetzt in der Kaufzeit, höchstens drei pro Kaufzeit. Der Kauf-Check erscheint 5 Sekunden vor Ende der Kaufzeit (dafür fordert die cfg zusätzlich `phase_countdowns` an; ausgewertet wird nur der Kaufzeit-Countdown, nie der Bomben-Countdown). Beginnt die Runde, werden offene Tipps verworfen und die Sprechblase blendet sich aus, solange du lebst.
- **Optionen:** Im Companion unter „Rundentipps → Optionen“ und per Rechtsklick auf die Figur („CS2-Rundentipps“) lässt sich jede Funktion einzeln abschalten: Wirtschaft, Kauf-Check, Map-Übersicht, Spray-Muster, Deine Matches, Team & Spielstand, Nach dem Tod, Gewohnheiten, Motivation, Zusammenfassung.
- **Deine Matches von der Webseite:** Öffnest du auf der Webseite „Meine Stats“, während der Companion verbunden ist, schickt die Seite eine kleine Zusammenfassung deiner analysierten Matches an den Companion (pro Map: Matches, Siege, Runden je Seite, Todespositionen). Gespeichert wird sie nur lokal in `insights.json`. Der Companion sagt dir dann zum Beispiel: „In deinen letzten 7 Matches auf Dust II bist du als T 9× bei Long A gestorben. Probier mal eine andere Route, zum Beispiel Short.“ und markiert die Stelle auf der Karte. Löschen geht im Companion mit „Webseiten-Daten löschen“.
- **Team & Spielstand:** Hinweise bei Siegesserien beider Teams (mit verbleibenden Timeouts) und bei wiederholten Rundenenden, zum Beispiel mehrfach durch Zeitablauf als T verloren.

### Neu in 0.14.0: CS2-Rundentipps

Der Companion kann während deiner eigenen CS2-Matches Tipps geben. Er nutzt dafür die offizielle [Game State Integration](https://developer.valvesoftware.com/wiki/Counter-Strike:_Global_Offensive_Game_State_Integration) von Valve: CS2 schickt die Daten selbst an `127.0.0.1:31977/gsi`. Es gibt keinen Speicherzugriff, keine Injektion und keine Eingaben an das Spiel. Die Funktion ist standardmäßig aus und wird im Companion oder per Rechtsklick auf die Figur („CS2-Rundentipps“) eingeschaltet. Dabei legt der Companion `gamestate_integration_tecmon.cfg` im CS2-Ordner `game\csgo\cfg` an, mit einem eigenen zufälligen Token. Beim Ausschalten wird die Datei wieder entfernt. Läuft CS2 gerade, muss das Spiel einmal neu gestartet werden.

Angefordert werden nur die eigenen Spielerdaten (Geld, HP, Rüstung, Waffen, Match-Stats, Map, Runde). Daten über Gegner, Bombenzähler oder Zuschauerblöcke werden nicht angefordert. Während einer Demo-Aufnahme werden die Daten ignoriert. Tipps erscheinen in einer kleinen Sprechblase neben der Figur, die CS2 nie den Fokus nimmt: in der Kaufzeit (Wirtschaft, Pistolenrunde, letzte Runde der Halbzeit, Verlängerung, Matchball, Spray-Hinweis zur gekauften Waffe, Map-Tipps), kurz nach der Kaufzeit als Kauf-Check (Helm, Rüstung, Defuse-Kit, Geld übrig), nach dem eigenen Tod (ungeworfene Granaten, Peek mit wenig HP, AWP ohne Kill) sowie zur Halbzeit und am Matchende mit Zusammenfassung. Über das Match werden außerdem Gewohnheiten erkannt: frühes Nachladen, häufiges Geblendetwerden, Feuerschaden und Runden ohne Kill in Folge.

Sichtbar über dem Spiel ist die Sprechblase nur im Anzeigemodus „Vollbild im Fenster“. Bei FACEIT oder in Turnieren können eigene Regeln für Zusatzprogramme gelten.

### Neu in 0.11.0

Eigenes Cyberpunk-Video-Design: transparente Neon-Konturen am unveränderten CS2-Radar, eine dauerhaft sichtbare schräge Spieleranzeige, Logo und Randakzente in Cyan, Violett und TecMon-Gold. Bei einem Wechsel der Steam-ID fährt ein 1,1 Sekunden langer animierter Stinger mit dem nächsten Spielernamen über das Bild. Mehrere Szenen desselben Spielers bleiben direkt verbunden; keine Szene wird gekürzt. Die neue Grafik wird als festes Branding-v3-Paket geladen, SHA256-geprüft und während des Renderns gesperrt. Die Quellen der eigenen Vektorgrafiken liegen unter tools/cs2-companion/branding/source.

### Neu in 0.10.0

Vollständiger Windows-Installer und getrenntes Programm-Update im Release. Der FFmpeg-Download verwendet einen festen Upstream-Release mit SHA256 anstelle des täglich ersetzten latest-Links. GitHub prüft eine komplette isolierte Neuinstallation vor dem Upload.

### Neu in 0.9.0

Vollständige Browser-Aufnahme mit Sharecode oder direkt übergebener Originaldemo: keine manuelle Pfad-/JSON-Übergabe nötig. Validierte, besitzergebundene Loopback-Übertragung in begrenzten Stücken. Download/Übertragung, Aufnahme, Branding und fertige MP4 werden auf der Webseite gesteuert. Details in der Anleitung.

### Neu in 0.8.1

Native Holo-Sprechblase statt Windows-Rahmen: Spitze zur Figur, eigener ziehbarer Kopfbereich mit Einklappen-/Schließen-Buttons, Cyan-Scanlinien und passende Scrollbar sowie Eingaben.

### Neu in 0.8.0

Native transparente Windows-Desktopfigur mit dem TecMon-Webseiten-Bot: schweben, ziehen und per Klick ein Verbindungs-/Einstellungsfenster ein- oder ausklappen. Infobereich-Menü für Bewegung, Animation, Vordergrund und Beenden. Während lokaler Aufträge wird die Figur ausgeblendet. Das Fenster verwendet die vorhandene lokale Oberfläche in WebView2; Aufnahme und Dateien bleiben lokal. Details und Voraussetzungen stehen in der Anleitung.

### Neu in 0.7.0

Kompakte Standardansicht für die Browser-Steuerung. „Erweitert“ zeigt das bisherige vollständige lokale Studio. Download, Aufnahme und MP4-Übernahme können nach einmaliger Verbindung auf TecMon bedient werden; der Companion bleibt im Hintergrund geöffnet.

### Neu in 0.6.1

Originales TecMon-Logo, natives Startfenster mit animiertem Ladebalken, PostgreSQL erst bei Nutzung und verbesserte Update-Übergabe mit Wiederverbindung. Siehe die Anleitung für Details.

### Neu in 0.6: Video-Branding

Intro, Spielernamen und Wasserzeichen werden lokal mit FFmpeg ergänzt; Freitext und optionales Outro kommen aus dem Website-Auftrag. Das separat geladene Branding-Paket wird gegen feste SHA256-Werte geprüft. Der native Helfer prüft und sperrt die Eingabedateien während des Renderns gegen Schreiben und Ersetzen. Details, Grenzen und Schriftlizenzen stehen in der [Companion-Anleitung](tools/cs2-companion/README.md). Der öffentliche Build enthält zusätzlich einen Windows-Test der tatsächlichen Dateisperren.

### Neu in 0.5

Sharecode-Feld im Website-Auftrag, direkte Verbindung zwischen TecMon und dem lokalen Companion, Download oder Download + CS2-Aufnahme von der Webseite, Rückgabe der MP4 und offizieller Plugin-Fix für neuere CS2-Versionen. [Verbindungsablauf und genaue Grenzen](tools/cs2-companion/README.md).

### Neu in 0.4

Sharecodes oder Match-Dateien lokal herunterladen; mehrere Spielerperspektiven in einem gemeinsamen Highlight-Auftrag; TecMon-Icon in EXE/Installer/Oberfläche; sicherer Umgang mit einer zurückgebliebenen privaten Datenbank beim Update. Die neue Team-Auswahl erfordert den entsprechenden Website-Stand. Siehe Anleitung unter tools/cs2-companion/README.md.

Für bestehende Installationen gibt es im Release eine kleine Update-EXE. Sie aktualisiert nur Companion-Dateien; Datenbank und große Tools bleiben erhalten. Ab 0.4 ist die Updateprüfung direkt im Companion verfügbar.
