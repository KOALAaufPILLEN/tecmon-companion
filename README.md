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
