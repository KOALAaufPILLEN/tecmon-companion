# TecMon Companion

Das lokale Windows-Programm zu [TecMon](https://tecmon.online). Der Companion läuft auf deinem PC, macht aus deinen CS2-Demos fertige Highlight-Videos in echter Spielgrafik und begleitet dich als kleine TecMon-Figur auf dem Desktop: mit Rundentipps, Clip-Puffer, Fadenkreuz, Configs und Minispielen.

Alles Schwere passiert lokal: Demo laden, in CS2 aufnehmen, Branding, MP4. Die Webseite steuert nur und lädt das fertige Video auf Wunsch hoch.

**Download:** [tecmon.online/companion](https://tecmon.online/companion) · [neuestes GitHub-Release](https://github.com/KOALAaufPILLEN/tecmon-companion/releases/latest)

**Stand dieser Übersicht:** Version 0.45.0, Dokumentation 21. November 2026. Companion [#83](https://github.com/KOALAaufPILLEN/tecmon-companion/pull/83) ist gemergt: Wardogs-Scoreboard-Foto mit lokaler Windows-Texterkennung sowie Clip-Puffer-Fixes und Strg+Alt+T. Die Wardogs-Erkennung wurde noch nicht mit Windows-OCR auf einem echten PC geprüft; die Webseite nutzt `scoreboard-v1` noch nicht. Website #138–#143 (Major-Stats, Ordnerimport, Cookie-/Casino-Einwilligung, Rechtstexte und eigene CS2-Stats), #144 (Hotkey-Texte) und #145 (Importzähler) sind gemergt. Diese Website-Änderungen benötigen kein neues Companion-Release; Capabilities und `insights-v1`/`-v2` bleiben gleich. Version 0.44.1 ist mit #78 gemergt und veröffentlicht. Der Release-Status von 0.45.0 ist unter Releases zu prüfen. Website [#146](https://github.com/KOALAaufPILLEN/tecmon/pull/146) (Browser-Add-on 0.3.0), [#147](https://github.com/KOALAaufPILLEN/tecmon/pull/147) (Stats-Adresse und Steam-Profil) und [#150](https://github.com/KOALAaufPILLEN/tecmon/pull/150) (fortsetzbare Zahlen-Uploads, Pro-Import-Abgleich, Steam-ID plus 16-Byte-Matchcode-Hash) sind gemergt; Website-Code `2b1de4e2`. Der gemeinsame Website-Stand besteht 625 Website- und 35 Legacy-Companion-Tests, Typecheck und Produktions-Build. Keine neue Companion-Version oder Capability nötig; Pro-Demos und eigene Valve-Demos werden im Browser ausgewertet, die Demo-Dateien bleiben lokal. Companion-Dokumentation #84/#85 ist gemergt. Arcade-PR #31 der Webseite bleibt ausdrücklich offen. Ein Merge belegt kein Produktions-Deployment; echte angemeldete Produktions-Uploads sind nicht geprüft.

- [Was der Companion kann](#was-der-companion-kann)
- [So fängst du an](#so-fängst-du-an)
- [Sicherheit und Daten](#sicherheit-und-daten)
- [Windows herunterladen](#windows-herunterladen)
- [Für Entwickler](#für-entwickler)
- [TecMon-Stil](#tecmon-stil)
- [Lizenzen und Herkunft](#lizenzen-und-herkunft)
- [Versionsverlauf](#versionsverlauf)

## Website: Major- und Team-Stats · 19. November 2026

[Website-PR #138](https://github.com/KOALAaufPILLEN/tecmon/pull/138) ist gemergt. Unter CS2 führt eine eigene Einstiegsseite mit sechs Major- und 57 Teamlogos zu den jeweiligen Stats. Die Ansichten nutzen Team-/Majorfarben und einen Sternenhintergrund, zum Beispiel Singapur Rot-Weiß, FURIA Schwarz-Weiß und 9z Silber-Lila.

Gezeigt werden Begegnungen, historische Besetzungen sowie Team- und Spieler-Deep-Stats. Spieler-Overall zählt die erfassten Majors auch bei Teamwechseln. Ausschließlich Stats: keine Demo-Downloads, Replays oder Videos in diesem Bereich. Demos werden lokal ausgewertet; der geschützte Betreiber-Upload speichert die numerischen Ergebnisse aller Spieler beider Teams in Cloudflare D1. Ein echter Upload zu D1 ist weiterhin separat zu prüfen. Für den Companion ändern sich weder Version noch Capabilities; ein neues Companion-Release ist dafür nicht erforderlich.

## Neu in 0.45.0 · 20. November 2026

### Wardogs: Scoreboard-Foto mit lokaler Texterkennung

Wardogs hat keine offizielle Schnittstelle, keine Game State Integration und keine Replays. Das Wardogs-Paket (unter „Games“ installieren) liest deshalb nur ein Bildschirmfoto aus:

- **Strg+Alt+S** drücken und **Tab** halten. TecMon macht 4 Sekunden lang Bildschirmfotos (FFmpeg `ddagrab`, wie beim Clip-Puffer) und nimmt das Foto, auf dem das Scoreboard zu sehen ist. Die Reihenfolge ist egal.
- Die **Texterkennung von Windows** (Windows.Media.Ocr über Windows PowerShell) liest das Foto lokal aus. Es wird nichts heruntergeladen und nichts ins Internet geschickt. Die Fotos werden direkt danach gelöscht.
- Gespeichert werden nur die Werte der **eigenen Zeile**, erkannt am Ingame-Namen: in der Wardogs-„PUNKTELISTE“ verdientes Geld, Tötungen, Assists, Todesfälle und Wiederbelebungen, dazu der Kontostand oben rechts. Ist der Name nicht lesbar, findet TecMon die eigene Zeile über die RELAY-Kennung (nur wenn genau eine Zeile passt). Fehlt eine Geld-Spalte (andere Spiele), gilt ein „$…“ aus dem HUD. Die Werte liegen in `wardogs/scoreboard-stats.json` (höchstens 500 Fotos).
- Die Companion-Seite zeigt die letzten Fotos mit der Differenz zum vorigen Foto. Für Match-Stats also zu Rundenbeginn und am Ende ein Foto machen.
- Standardmäßig aus. Der Hotkey wird nur angemeldet, solange die Funktion an ist. Entfernen des Pakets löscht Einstellungen und Werte.
- Bridge `scoreboard-v1`: `GET /bridge/scoreboard` gibt der Webseite nur Zeit, Werte und Erkennungs-Sicherheit, keine Bilder.
- Abgestimmt auf echte Wardogs-Screenshots (20. November 2026): deutsche und abgeschnittene Spaltenköpfe, zweizeilige Kopfzeile, „$“, das die Texterkennung als „8“ oder „s“ liest. Geprüft mit nachgebautem Layout und einer Texterkennung unter Linux, noch nicht mit der Windows-Texterkennung auf einem echten PC.
- Grenzen: Die Texterkennung kann einzelne Ziffern falsch lesen, besonders kleine Nullen. Was nicht lesbar ist, fehlt im Ergebnis und wird nicht als 0 gespeichert.

### Clip-Puffer


- **Neuer Hotkey Strg+Alt+T** (T wie TecMon) statt Strg+Alt+C zum Speichern eines Clips.
- **Lesbare Fehler in der Figur.** Rechtsklick-Menü und Strg+Alt+T zeigten bei einem Fehler nur „(400) Ungültige Anforderung“. Jetzt erscheint der Grund aus dem lokalen Dienst, etwa „Der Clip-Puffer ist aus“ oder die FFmpeg-Meldung. Das gilt für alle Aktionen der Figur.
- **Neustart nach Absturz.** Steigt FFmpeg mitten im Spiel aus (zum Beispiel wenn ein Spiel Auflösung oder Vollbildmodus wechselt), startet der Puffer nach 3 Sekunden selbst neu, höchstens 5-mal in 10 Minuten. Strg+Alt+T sagt in der Zwischenzeit, dass der Puffer gerade neu startet.
- **Kaputte Tonquelle.** Lässt sich die gewählte Tonquelle (etwa ein deaktivierter „Stereomix“) nicht öffnen, nimmt der Puffer ohne Ton auf und meldet das, statt gar nicht zu starten.
- **Schalter bleibt ehrlich.** Startet die Aufnahme beim Einschalten nicht, bleibt der Clip-Puffer aus, statt dauerhaft „startet …“ zu zeigen.

## Neu in 0.44.1 · 19. November 2026

- **Demo-Download über die Webseite repariert:** In `createCompanion()` überschrieb die interne Sharecode-Funktion `fetchDemo` den gleichnamigen HTTP-Zugriff der Browser-Bridge. Trotz Verbindung und funktionierendem Valve-Link erschien dadurch „Valves Replay-Server ist nicht erreichbar“. Die interne Funktion heißt jetzt `fetchJobDemo`; die Bridge verwendet wieder den HTTP-Zugriff. Kein Server-Proxy und keine geänderten Valve-URL-Freigaben.
- Der Regressionstest koppelt einen Browser, lädt eine gepackte Testdemo über `/bridge/demo-fetch`, prüft die unveränderten Bytes und stellt sicher, dass kein Sharecode-Auftrag gestartet wird. Der gemeldete echte Valve-Link wurde außerdem über eine frisch gekoppelte, isolierte Companion-Bridge mit HTTP 200 und BZh9-Signatur geprüft und danach clientseitig abgebrochen; ein vollständiger echter Match-Download ist dadurch noch nicht bestätigt.
- **Für bestehende Installationen:** Companion aktualisieren. Erneutes Koppeln allein repariert die fehlerhafte ältere Version nicht.
- **Website, eigener Änderungsstand:** YouTube-Uploads setzen keinen Discord-Webhook voraus; auch ein fehlerhafter optionaler Discord-Versand lässt das fertige YouTube-Ergebnis bestehen. Der Demo-Assistent bietet eine direkt erreichbare lokale Dateiauswahl ohne Add-on/Companion sowie Verbindungsbedienung bei Steam und Sharecodes. Die Webseite muss dafür ebenfalls den neuen Stand erhalten.

## Änderungen vom 18. November 2026

**Bereits auf `main`:**

- [#68](https://github.com/KOALAaufPILLEN/tecmon-companion/pull/68): README auf 0.42.1 gebracht; TecMon-Stil und Pflege beider READMEs als Arbeitsregel festgehalten.
- 0.42.2: [#70](https://github.com/KOALAaufPILLEN/tecmon-companion/pull/70) bringt die Companion-Seite in den TecMon-Stil mit neuer 3D-Figur; [#73](https://github.com/KOALAaufPILLEN/tecmon-companion/pull/73) korrigiert alte Waffenmodelle und Handschuhe weiterer Agenten.
- 0.43.0, [#74](https://github.com/KOALAaufPILLEN/tecmon-companion/pull/74): GSI-Live-Anzeigen, Bomben-Auswertung, kürzere Tipp-Verfallszeiten, GSI-Heartbeat und Cobblestone-Unterstützung. Die Bomben-Anzeige ist standardmäßig ausgeschaltet.
- 0.43.1, [#76](https://github.com/KOALAaufPILLEN/tecmon-companion/pull/76): Cobblestone mit 19 Radar-Callouts, Bombenplätzen und Spawns.
- 0.44.0, [#75](https://github.com/KOALAaufPILLEN/tecmon-companion/pull/75): flüssige GLB-Figur, gespeicherte Figur-Einstellungen, Windows-Autostart und kompaktes Linksklick-Menü; Änderungen aus 0.43.0 und 0.43.1 übernommen.
- Webseite: [#119](https://github.com/KOALAaufPILLEN/tecmon/pull/119) schaltet den Demo-Dateitransfer über Vercel ab; #126/#129 aktualisieren Companion-Dokumentation und Design, #127/#128 CS2-Kartenpools und Cobblestone mit Voxel-Karte, Radar und Taktikboard. [#130](https://github.com/KOALAaufPILLEN/tecmon/pull/130) erhält Companion-Downloadfehler und startet den Worker erst nach dem Download; [#131](https://github.com/KOALAaufPILLEN/tecmon/pull/131) zeigt kopierbare Valve-Links und vermeidet leere Download-Tabs.

**Mit Website-[#132](https://github.com/KOALAaufPILLEN/tecmon/pull/132):** Browser-Erweiterung 0.2.0, lokale Demo-Downloads, Browser-Logos und Testpakete unter `/companion#browser-erweiterung` sowie das Freigeben eigener Steam-Bot-Sitzungen nach Metadatenabfragen. Companion-[#77](https://github.com/KOALAaufPILLEN/tecmon-companion/pull/77) dokumentiert diese Website-Änderungen und die neuen Regeln; es ist kein neues Companion-Programmrelease.

**Eigener Steam-Verlauf und Countdown, ebenfalls Website-#132:** Add-on 0.2.0 liest den eigenen angemeldeten Steam-Browser-Verlauf mit SteamID-Prüfung und direkten Demo-Links. Bei vorübergehenden Bot-Fehlern wird nach einem sichtbaren 10-Sekunden-Countdown erneut versucht, höchstens dreimal und mit Abbruch. Hinweis: „Wartezeit umgehen? Nutze das Browser-Add-on.“. Keine globale Warteschlange und keine Wiederholung dauerhafter Zugangsdatenfehler. Ein echter Download aus einer angemeldeten Steam-Sitzung ist noch zu prüfen; kontrollierte Browser-Tests bestätigen diesen Produktionsfall nicht.

Ein Merge bestätigt kein Produktions-Deployment. Firefox-Testpakete benötigen für dauerhafte Installation eine Mozilla-Signatur; Safari benötigt einen eigenen Apple-Build. Die CS2-Aufnahme bleibt lokal im Companion.

## Neu in 0.44.0

- **Flüssige 3D-Figur:** TecMon auf dem Desktop wird jetzt live aus dem 3D-Modell (GLB) gezeichnet
  und dreht sich stufenlos statt in 5°-Schritten; Gesichter und Ausdrücke bleiben gleich.
  Unter **Figur & Start** wählst du die Darstellung: **3D-Modell · High process** (Standard)
  oder **Bilder · Low process** (die bisherigen Bilder, am sparsamsten).
- **Einstellungen bleiben gespeichert:** Umherfliegen, Animation, Im Vordergrund und die
  Darstellung gelten nach einem Neustart und nach Updates weiter (`desktop.json`).
- **Mit Windows starten:** schaltbar im Fenster, im Schnellmenü und unter „Figur“ im
  vollständigen Menü. Trägt nur den Companion in deinen Benutzer-Autostart ein.
- **Linksklick-Fenster kompakter:** statt fünf Reitern eine sortierte Liste zugeklappter
  Kategorien (Status & Videos, Figur & Start, CS2, Dota 2, Clips, TecMon, Spiel-Pakete).
  Immer nur eine ist offen, rechts im Kopf steht ein kurzer Stand wie „Verbunden“ oder „Puffer aus“.

## Neu in 0.43.1

- **Cobblestone auf dem Radar:** 19 Callouts, beide Bombenplätze und Spawns für die
  Radar-Tipps zum Halbzeitstart und die Auswertung deiner Todesorte. Die Positionen stammen
  aus den Ortsangaben der Karte selbst (CS2-Update vom 17.11.2026), nicht geschätzt.

## Neu in 0.43.0

Zum CS2-Update vom 17. November 2026 („The Cobbled Road to Singapore“):

- **Live-Anzeigen aus der offiziellen GSI**, je Phase und nie dauerhaft. Der Wert ändert sich
  in derselben schmalen Sprechblase, es kommt keine neue Blase dazu, und echte Tipps haben Vorrang:
  - *Kaufzeit:* Geld, Ausrüstungswert, Rüstung/Helm, Kit (CT) und Restzeit. Verschwindet, sobald
    die Runde läuft.
  - *Nach dem Plant:* Bomben-Timer, Defuse-Check mit oder ohne Kit und die neue
    Bomben-Vorschau `health_c4_preview` („Nach der Explosion hättest du hier noch 25 von 80 HP“).
  - *Nach einem eigenen Kill:* 5 Sekunden lang Kills, Kopfschüsse und Schaden der Runde.
  - *Magazin fast leer:* kurzer Hinweis mit Restmunition.
  - *Rundenende:* Bilanz mit Kills, Schaden, vollen Flashes, Sekunden im Feuer und in Smoke.
  Jede Anzeige lässt sich unter Rundentipps einzeln abschalten. Die Bomben-Anzeige ist
  **standardmäßig aus**; beim Einschalten weist TecMon darauf hin, dass FACEIT und viele
  Turniere Bomben-Timer verbieten.
- **Keine verspäteten Kauftipps mehr:** Ein Tipp aus der Kaufzeit, der erst nach Rundenstart bei
  der Figur ankäme, verfällt. Die Figur wartet höchstens 1,2 s statt 2,5 s, bis sie einen Tipp zeigt.
- **Bomben-Auswertung:** Stirbst du an der Explosion, kommt nach der Runde ein kurzer Tipp
  (als T Abstand halten, als CT rechtzeitig raus und die Waffe retten).
- CS2 schickt die GSI-Daten jetzt spätestens alle 2 Sekunden (`heartbeat` 2.0 statt 10.0).
- **Cobblestone (`de_cbble`):** Map-Tipps für T und CT, Routen-Vorschläge für die neuen
  Callouts, im Video-Branding heißt die Karte „COBBLESTONE“ statt „CBBLE“. Radarbild und
  Callout-Punkte folgen, sobald das Radarbild lokal exportiert ist.

## Neu in 0.42.2

- Alte Skins wie Howl, Dragon Lore oder Medusa zeigen wieder das alte Waffenmodell. Bisher
  bekam die Waffe nur die Mesh-Maske, nicht die Bodygroup, die CS2 dafür liest.
- Getauschte Handschuhe bei Agenten, deren Handschuhe der Companion schätzen muss: Er nimmt jetzt
  den Platz eines bekannten Agenten derselben Reihe (etwa SEAL/ST6), statt immer den letzten.

## Neu in 0.42.1

- Messertausch: Der Rewriter lässt CS2 das Modell aus Item-Definition und Unterklasse bestimmen. Das direkte Überschreiben von `m_hModel`, das beim Demo-Sprung einen CS2-Absturz auslösen konnte, entfällt.
- Getauschte Waffen tragen bei der Demo-Aufnahme das Namensschild „www.TecMon.Online“.
- Fehler der Windows-Prozessabfrage brechen mit einer eigenen Meldung ab, statt ein Aufnahmeende vorzutäuschen. Bei Aufnahmefehlern bleibt der ursprüngliche Fehler erhalten; `recording-diagnostics.txt` im lokalen Auftragsordner sichert ihn zusammen mit dem Plugin-Protokoll. Ein CS2-Fehlerbericht wird ohne unbestätigte Schuldzuweisung an HLAE oder das Plugin gemeldet.

## Was der Companion kann

### Highlight-Videos aus CS2-Demos

- **„In CS2 aufnehmen“ auf tecmon.online:** Du wählst im Demo-Manager Szenen und Spieler, der Companion erledigt den Rest: Demo per Sharecode über dein Steam laden (oder direkt aus dem Browser übernehmen), in CS2 aufnehmen, mit TecMon-Branding zu einer MP4 verarbeiten und an die Webseite zurückgeben. Fortschritt und Fehler siehst du auf der Webseite, die Figur sagt dir nebenbei, an welchem Schritt sie gerade ist.
- **Eigene TecMon-Engine:** Download und Aufnahme laufen komplett im Companion, ohne CS Demo Manager und ohne Datenbank.
- **Demos für die Webseite laden:** Öffnest du auf tecmon.online eine Demo aus deinem Match-Verlauf, lädt der Companion sie direkt bei Valve (`demo-fetch-v1`), statt dass sie über den TecMon-Server läuft. Er speichert dabei nichts; die Webseite entpackt und wertet selbst aus.
- **Kamera:** Egoansicht, feste Freikamera-Punkte, weiche Kamerafahrten über bis zu 8 Punkte, Verfolger-Kamera, Spieler-Intro von vorn und „Kamera im Spiel setzen“ (Punkte mit F8 direkt in CS2 merken).
- **Branding:** Animiertes TecMon-Intro in zwei Stilen (Neon-Raster oder Hologramm), Esport-Titelbild, Spielerwechsel im Teamvideo, animiertes HUD am Radar, Outro und weiche Übergänge.
- **Kill-Anzeige:** Neben dem TecMon-Logo erscheint bei jedem Kill „1K · KILL“ bis „ACE · ALL 5 ENEMIES“, mit Headshot-Hinweis.
- **Deathcam:** Oben steht „DEATHCAM: Name“, vorher kommt ein kurzes Intro von vorn auf den Spieler, der stirbt.
- **36 Filter:** je Szene ein Filter nur aufs Gameplay, auf Wunsch ein eigener für Intro, Spielerwechsel und Outro.
- **Skin-Tausch für Videos (Zusatz-Addon):** zeigt in einer Szene andere Waffenskins, Messer und Handschuhe. Der Companion schreibt dafür eine Kopie der Demo um; die Original-Demo und dein Live-Spiel bleiben unberührt. Getauschte Waffen tragen das Namensschild „www.TecMon.Online“. Messer und Handschuhe je Seite (T/CT), alte Skins mit altem Waffenmodell, Original-Sticker auf Wunsch, der Killfeed zeigt das getauschte Messer. Standardmäßig aus, Einschalten nur nach bestätigtem Hinweis.
- **Agenten-Tausch und Huhn-Modus:** je Spieler und Seite ein anderer Agent fürs ganze Video, mit passenden Handschuhen. Als Experiment wird der Spieler zum Huhn, mit wählbarer Größe, Rasse und Farbe. Beides schreibt der eigene TecMon-Demo-Rewriter in dieselbe Demo-Kopie.

Grenzen: höchstens 40 Szenen und 20 Minuten Spielzeit pro Auftrag. Steam und CS2 müssen installiert sein, und CS2 darf während der Aufnahme nicht schon laufen.

### Highlight-Video nach dem Match

Standardmäßig aus. Eingeschaltet fragt TecMon nach einem fertigen Premier-, Wettkampf- oder Wingman-Match, sobald du wieder im Hauptmenü bist: „Neues Highlight-Video erstellen?“. Die Frage ist ein eigenes kleines Fenster und nimmt CS2 keinen Fokus. Nach „Ja“ lädt der Companion die Demo deines letzten Matches, sobald du CS2 schließt, ohne Sharecode. Die TecMon-Seite wählt deine besten Szenen (höchstens 3 Minuten), nimmt sie mit deinem zuletzt benutzten Stil auf und lädt das Video hoch:

- angemeldet: öffentlich zu YouTube und zusätzlich in deinen gespeicherten Discord-Webhook,
- nicht angemeldet: nur in den Discord-Webhook (bis 10 MB).

Hochladen macht nur die Webseite mit den Einstellungen in deinem Browser. Der Companion bekommt keine YouTube- oder Discord-Zugangsdaten.

### Clip-Puffer für alle Spiele

Standardmäßig aus. Eingeschaltet nimmt TecMon den Bildschirm laufend auf und behält nur die letzten 10 bis 120 Sekunden. **Strg+Alt+T** speichert sie als Clip. Die Aufnahme nutzt wenn möglich die Grafikkarte (NVENC, AMF, Quick Sync). „Branding erstellen“ setzt Logo, Titel und Abspann; nur gebrandete Clips kann TecMon.online abholen und zu YouTube hochladen. Kein Hook, keine Injektion, kein Mitlesen der Tastatur.

### Spiele-Reiter: CS2

Diese Funktionen gehören zum Spiel-Paket CS2 (standardmäßig installiert, unter „Pakete“ entfernbar):

- **Rundentipps:** Hinweise in der Kaufzeit (Wirtschaft, Kauf-Check, Spray-Muster der gekauften Waffe, Map-Übersicht mit Callouts), nach deinem Tod, zur Halbzeit und am Matchende. Höchstens 3 Tipps pro Kaufzeit; sobald die Runde läuft und du lebst, ist TecMon still. Ausnahme sind die Live-Anzeigen (Bomben-Timer und -Vorschau nach dem Plant, Kill-Zähler, Magazin): stehende Werte ohne neue Tipps. Jede Tippart lässt sich einzeln abschalten.
- **Tipps aus „Meine Stats“:** Öffnest du auf der Webseite „Meine Stats“, schickt sie eine Zusammenfassung deiner eigenen Matches (pro Map, dazu Gewohnheiten wie Eröffnungsduelle, Trades, Kopftreffer, Granaten und deine 8 meistgenutzten Waffen). Daraus kommen persönliche Tipps. Die Daten bleiben lokal in `insights.json` und lassen sich löschen.
- **Fadenkreuz-Editor:** Vorschau, Vorlagen, CS2-Fadenkreuz-Code übernehmen, speichern als `tecmon_crosshair.cfg`.
- **Fadenkreuz-Overlay:** zeigt dein Fadenkreuz als eigenes, durchklickbares TecMon-Fenster, nur im Vollbild-Fenstermodus. Standardmäßig aus, Einschalten auf eigenes Risiko nach bestätigtem Hinweis.
- **Fertige Configs:** 16 cfgs zum Speichern mit einem Klick, etwa Pro-Viewmodel, alle stumm per Taste, Springen aufs Mausrad oder Granaten-Training. Jede ist eine eigene Datei `tecmon_cfg_<name>.cfg`; deine Sensitivity und fremde cfgs bleiben unverändert.
- **Quiz:** Callout-Quiz und Waffenpreis-Quiz.

Die Rundentipps nutzen nur Valves offizielle Game State Integration und nur deine eigenen Werte. Keine Gegnerdaten, keine Eingaben ans Spiel. Was CS2 per GSI über den eigenen Spieler und die Runde schickt (etwa Bomben-Timer und Bomben-Vorschau), darf TecMon nutzen. Bei FACEIT oder in Turnieren können eigene Regeln für Zusatzprogramme gelten, Bomben-Timer sind dort oft verboten. Darum ist die Bomben-Anzeige standardmäßig aus.

### Spiele-Reiter: Dota 2

Installierbares Paket mit Dota-2-Tipps über die offizielle Game State Integration: Last-Hit-Tempo, Gold für Buyback, beim Tod noch bereite Items, nicht ausgegebenes Gold und Match-Bilanz. Nur in Pausen, nach deinem Tod und am Matchende; nur eigene Werte, keine Karte, kein Roshan, keine Gegner. Dota 2 braucht dafür in Steam die Startoption `-gamestateintegration`. Valorant, Deadlock und Wardogs stehen als geplant in der Liste.

### Die TecMon-Figur

- **Desktopfigur:** TecMon schwebt als 3D-Figur über dem Desktop, mit Augen, die je Stimmung Farbe und Ausdruck wechseln. Standard ist das echte 3D-Modell, das sich flüssig dreht (High process); sparsamer sind die vorab gerenderten Bilder (Low process). Tipps erscheinen in einer goldenen Holo-Sprechblase, die CS2 nie den Fokus nimmt.
- **Rechtsklick: Schnellmenü** mit Kacheln (Einstellungen, Highlights, Clip speichern, Letzte Videos, Minispiele, TecMon.online), Schaltern für Highlight-Video nach dem Match, Rundentipps, Clip-Puffer und Figur sowie der Persönlichkeit. „Alle Optionen …“ öffnet das vollständige Menü.
- **Linksklick: Fenster mit zugeklappten Kategorien** Status & Videos, Figur & Start, CS2, Dota 2, Clips, TecMon und Spiel-Pakete; immer nur eine offen.
- **Figur & Start:** Darstellung (High/Low process), Umherfliegen, Animation, Im Vordergrund und „Mit Windows starten“. Alles bleibt über Neustarts gespeichert.
- **Persönlichkeit:** Super nett, Normal, Nerdy oder **HUAN-Modus (ab 18)** mit derbem Trashtalk über dein eigenes Spiel, nie über Personen. HUAN muss vor dem Einschalten bestätigt werden. Der Modus ändert nur den Ton der Tipps, nicht Inhalt oder Zeitpunkt.
- **Mit TecMon spielen:** Level, Laune, Energie und Freundschaft (lokal in `pet.json`), dazu Reaktionstest, Schere-Stein-Papier, Ziele treffen, Muster merken und Zahl raten.

### Automatische Updates

Der Companion sucht zwei Minuten nach dem Start und danach alle sechs Stunden nach einem neuen Release, prüft Manifest, Größe und SHA-256 und installiert es selbst. Nie während eines Downloads oder einer Aufnahme. Abschaltbar unter „Erweitert → Updates & Info“.

## So fängst du an

1. Setup von [tecmon.online/companion](https://tecmon.online/companion) installieren und den Companion starten. TecMon erscheint auf dem Desktop.
2. Auf tecmon.online den Companion einmal verbinden und die Seite im Companion freigeben.
3. Im Demo-Manager ein Match wählen, Szenen auswählen und „In CS2 aufnehmen“ klicken. Das fertige Video erscheint auf der Webseite und unter „Letzte Videos“.
4. Optional: im Fenster unter „Spiele“ Rundentipps, Highlight-Video nach dem Match oder Skin-Tausch einschalten, unter „Clips“ den Clip-Puffer.

Mehr Details zu Einrichtung, Aufnahme und Branding stehen in der [Anleitung](tools/cs2-companion/README.md). JSON-Import und manuelle Dateiauswahl gibt es weiter unter „Erweitert“.

## Sicherheit und Daten

- Keine YouTube-/Google-OAuth-Secrets, Refresh-Tokens, Website-Umgebungsdateien oder persönlichen Installationsdaten werden mitgeliefert. Der Companion braucht keinen Zugang zum TecMon-YouTube-Kanal.
- Zur Laufzeit erzeugt er lokale Zugangsdaten, etwa ein zufälliges Sitzungstoken für die lokale API. Diese Werte sind **keine öffentlichen Repository-Dateien**.
- Die API bindet an `127.0.0.1`. Die API prüft Host, Origin und Sitzungstoken. Webseiten müssen einmal im Companion freigegeben werden.
- Demos, Aufnahme und Kodierung laufen lokal. Eine Aufnahme startet nur nach ausdrücklicher Bestätigung. Rohclips ohne Branding gibt der Companion nicht heraus.
- Fremde Programme (CS2-Aufnahme-Plugin, boiler-writter, HLAE, FFmpeg, Video-Pakete) werden nur mit fester Prüfsumme genutzt. Bei Abweichung bricht der Companion ab. Das schützt vor beschädigten oder ausgetauschten Downloads, nicht vor jemandem, der den eigenen PC selbst verändert.
- Rundentipps und Dota-2-Tipps lesen nur, was das Spiel selbst per Game State Integration schickt, und nur eigene Spielerdaten. Kein Speicherzugriff, keine Injektion, keine Eingaben an das Spiel.

Details, Grenzen und Hinweise für Reviewer: [SECURITY.md](SECURITY.md). Offener Code und bestandene Tests ersetzen kein unabhängiges Sicherheitsaudit.

## Windows herunterladen

Die einfachste Quelle ist [tecmon.online/companion](https://tecmon.online/companion): Die Seite verlinkt automatisch die neueste Version. Im [aktuellen GitHub-Release](https://github.com/KOALAaufPILLEN/tecmon-companion/releases/latest) gibt es zwei getrennte EXE-Dateien:

- **TecMon-Companion-Setup-X.Y.Z.exe**: für neue Nutzer ohne vorhandene Installation. Enthält Companion und Node.js. Das Setup lädt HLAE und FFmpeg vom Originalanbieter mit SHA256-Prüfung nach; eine Datenbank oder ein Passwort braucht es nicht. Steam und CS2 müssen bereits installiert sein. Internetverbindung erforderlich.
- **TecMon-Companion-Update-X.Y.Z.exe**: für bestehende Installationen. Ersetzt nur Companion-Programmdateien und erhält Tools, Demos, Videos und Einstellungen. Meist brauchst du sie nicht, weil der Companion sich selbst aktualisiert.

Feste Links auf die jeweils neueste Version: [Setup](https://github.com/KOALAaufPILLEN/tecmon-companion/releases/latest/download/TecMon-Companion-Setup.exe) und [Update](https://github.com/KOALAaufPILLEN/tecmon-companion/releases/latest/download/TecMon-Companion-Update.exe). Prüfsummen und Update-Manifest beziehen sich auf die Dateien mit Versionsnummer.

Vor Installation oder Update den Companion schließen. Die Prüfsumme des Installers steht neben der EXE als `.sha256`; das Update hat ein eigenes JSON-Manifest und `SHA256SUMS.txt`. WebView2 Evergreen Runtime muss vorhanden sein; siehe [Build- und Laufzeitvoraussetzungen](BUILDING.md).

## Für Entwickler

### Aus Quellcode starten

Node.js ab Version 24; Steam und CS2 für echte Aufnahmen. Die Laufzeit hat keine npm-Abhängigkeiten. Die Entwicklungsabhängigkeiten werden nur für Build-Schritte gebraucht.

```sh
npm ci
npm test
npm start
```

Der Quellmodus startet die lokale Companion-Seite, richtet aber keine vollständige Toolchain ein. Native Dateiauswahl, Desktopfigur und verwaltete Installation brauchen den Windows-Build.

### Windows-Installer bauen

Siehe [BUILDING.md](BUILDING.md). Alle Launcher-, Installer- und Serverquellen sind enthalten. Drittanbieterpakete werden aus den dokumentierten Originalquellen geladen und gegen hinterlegte SHA256-Werte geprüft. Es liegen keine vorkonfigurierten Datenbanken oder fertigen Runtime-Binaries im Repository. Jeder Merge auf `main` mit neuer Version veröffentlicht automatisch ein Release.

### Browser-Bridge und Capabilities

Die Webseite prüft vor jeder Funktion, was der Companion unter `/bridge/state` meldet. Bestehende Capabilities werden nie geändert oder entfernt.

| Gemeldet | Capabilities |
| --- | --- |
| immer | `browser-demo-v1`, `xray-v1`, `insights-v1`, `insights-v2`, `demo-fetch-v1` |
| mit verwalteter Installation | `clips-v1`, `video-branding-v1`, `video-style-v1`, `video-filter-v1`, `video-filter-v2`, `kill-badge-v1`, `deathcam-label-v1`, `camera-points-v1`, `recorder-internal-v1` |
| zusätzlich mit eigener Engine | `camera-script-v1`, `camera-session-v1`, `camera-angle-v1`, `auto-highlights-v1`, `skin-swap-setup-v1` |
| zusätzlich mit mitgeliefertem Rewriter (`tecmon-demo-rewriter.exe`) | `agent-swap-v1`, `chicken-v1`, `chicken-breed-v1` |
| zusätzlich mit eingeschaltetem Skin-Tausch und mitgeliefertem Rewriter | `skin-swap-v1`, `skin-swap-v2`, `skin-side-v1`, `skin-legacy-v1`, `skin-stickers-v1` |

### Tests

`npm test` führt über 130 automatisierte Tests aus, darunter die Prüfung, dass Rundentipps und Dota-2-Tipps keine verbotenen GSI-Blöcke anfordern und die CFG-Sammlung nur erlaubte Befehle enthält. Bei jedem Release wird zusätzlich eine isolierte Windows-Neuinstallation getestet. Die Tests sind kein Nachweis, dass jede Demo mit jeder CS2-Version aufgenommen werden kann. Regeln für Beiträge stehen in [AGENTS.md](AGENTS.md).

## TecMon-Stil

Companion-Seite, Linksklick-Fenster, Schnellmenü und Sprechblase folgen denselben Designregeln wie tecmon.online. Sie gelten für jede neue oder überarbeitete Oberfläche:

- **Abgeschnittene Ecken statt Rundungen:** Karten, Knöpfe, Felder und Listenzeilen per `clip-path` mit `border-radius: 0`; die schräge Kante zeichnet ein Verlauf in Rahmenfarbe (`--cut`, `--edge`, `--fill` in `public/style.css`, Bereich `body.desktop-panel.holo`). Große Karten 16 px Schnitt, Zeilen 9 px, Knöpfe 7 px, Felder 6 px, Abzeichen 5 px.
- **Eckige Eingabefelder**, dunkle Fläche, dünner Rahmen; im Fokus wird die Kante Gold.
- **Farben:** Schwarz und Tiefviolett als Grund, Lila (`#a78bfa`) für Rahmen und Kanten, **Gold** (`#e8c573`) für Akzente mit Bedeutung. Große Karten tragen goldene Kanten an den zwei Hauptecken.
- **Aktive Wahl ist Gold:** gewählter Reiter als goldenes Parallelogramm, eingeschaltete Optionen und installierte Pakete mit goldener Kante. Nicht gewählte Optionen bleiben Lila oder neutral.
- **Hintergrund:** Sternenhimmel als allgemeiner Hintergrund (feine, versetzt funkelnde Sterne mit lila Glow), bei ausgeschalteter Animation stehend. Bestehende Fenster bekommen ihn bei der nächsten Überarbeitung.
- **Formen:** Statuspunkte als Raute, Reiter als Parallelogramm, keine Kreise und Pillen in neuen Bereichen.
- **Kategorien statt Reiter in kleinen Fenstern:** zugeklappte Abschnitte mit abgeschnittenen Ecken, Name in Gold und Versalien, kurzer Stand rechts, Raute als Pfeil (lila zu, gold offen); offene Kategorie mit goldener Kante, immer nur eine offen.
- **Bewegung:** Übergänge nur mit benannten Eigenschaften und den `--tm-dur-*`-Zeiten, nie `transition: all`. Drücken mit `scale(0.96)`, nie unter 0,95. Hover nur bei Maus (`@media (hover: hover) and (pointer: fine)`); breite Karten ändern nur die Farbe.
- **Bedienung:** Trefferflächen mindestens 40 px, Esc schließt Rückfragen, keine Windows-Standarddialoge während des Spiels, die Sprechblase nimmt CS2 nie den Fokus.
- **Marke:** vorhandenes TecMon-Logo und die TecMon-Figur, keine fremden Icons oder Marken-Overlays.

Die ausführliche Fassung mit Vorlagen steht auf der Webseite in `docs/tecmon-style.md` (Repo `tecmon`); die verbindliche Kurzfassung für dieses Repo steht in [AGENTS.md](AGENTS.md) unter „Oberfläche“. Neue Stilregeln werden an beiden Stellen eingetragen.

## Lizenzen und Herkunft

Der Companion-Quellcode steht unter der MIT-Lizenz. Beiträge, Fehlerberichte und Sicherheitsprüfungen sind willkommen. Dieses Repository enthält nur den Companion und seine Build-Werkzeuge, mit eigener Git-Historie; der private Website-Code wird nicht veröffentlicht. Das TecMon-Logo dient zur Kennzeichnung; die Lizenz gewährt keine Markenrechte.

Drittanbieter behalten ihre eigenen Lizenzen, einschließlich MIT, GPL und AGPL. Siehe [THIRD-PARTY-NOTICES.txt](tools/cs2-companion/windows/THIRD-PARTY-NOTICES.txt) und [dependency-manifest.json](tools/cs2-companion/windows/dependency-manifest.json). Wer Binärpakete weitergibt, muss deren Lizenz- und Quellcodepflichten erfüllen.

- Der Installer enthält Node.js mit seiner Lizenz; HLAE und FFmpeg lädt er bei Bedarf von den Originalanbietern.
- Das CS2-Aufnahme-Plugin stammt aus [CS Demo Manager von AkiVer](https://github.com/akiver/cs-demo-manager) (MIT). Der Companion lädt es bei der ersten Aufnahme vom festen Stand und prüft die Prüfsumme; der Ablauf der eigenen Engine folgt CS Demo Manager 3.20.1. Danke!
- boiler-writter (MIT) lädt der Companion beim ersten eigenen Download vom npm-Paket und prüft die feste Prüfsumme.
- Skin-Tausch: Die Idee, Skins in einer Kopie der Demo zu tauschen, kommt aus dem Projekt CS2-nskinz von Lyan-edit. Der TecMon-Demo-Rewriter ist eine eigene Umsetzung ohne dessen Code und wird nicht nachgeladen.
- Radarbilder werden nicht mitgeliefert. Der Companion kopiert sie nur aus einem schon vorhandenen CS-Demo-Manager-Ordner (ältere Installation oder eigenes Programm) in seinen Datenordner; sonst zeigen die Tipps nur Text.
- Der eigene Demo-Rewriter für Agenten- und Skin-Tausch (`native/tecmon-demo-rewriter`, MIT) nutzt die Bibliothek [source2-demo von Artem Rupasov](https://github.com/Rupas1k/source2-demo) (MIT oder Apache-2.0). Danke!

## Versionsverlauf

Neueste Version zuerst.

### Neu in 0.44.0: Flüssige 3D-Figur, gespeicherte Einstellungen, Autostart

- Die Desktopfigur wird live aus dem 3D-Modell gezeichnet (eigener kleiner Software-Renderer
  in `TecMon.cs`, kein 3D-Framework, keine GPU-Treiber nötig). Das Modell entsteht aus
  `base.glb` mit `scripts/figure-3d/model.py`: Visier geglättet, auf etwa 28.000 Dreiecke
  vereinfacht, Texturen und LED-Gesichter in `windows/desktop-bot-model.zip` (Ressource `TecMonModel`).
  Neu gezeichnet wird nur, wenn sich Winkel oder Gesicht ändern; Schweben und Neigen laufen wie bisher.
- „Bilder · Low process“ nutzt die bisherigen 72 Drehbilder. Fehlt das Modell oder lädt es nicht,
  bleibt die Figur automatisch bei den Bildern.
- Figur-Einstellungen liegen in `desktop.json` (`GET /api/state` → `desktop`,
  `POST /api/desktop/settings`) und gelten nach Neustart und Update weiter.
- „Mit Windows starten“ setzt nur den Eintrag `TecMon Companion` unter
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`; Deinstallieren entfernt ihn.
- Linksklick-Fenster: Kategorien statt Reiter, Stand im Kopf, eine Kategorie offen.

### Neu in 0.43.0: CS2-Update mit Cobblestone und Live-Anzeigen

Siehe [Neu in 0.43.0](#neu-in-0430) oben.

### Neu in 0.42.2: Companion-Seite im TecMon-Stil

- Die lokale Seite unter `http://127.0.0.1:31977` sieht jetzt aus wie tecmon.online
  statt im türkisen Holo-Look: dunkler Sternenhimmel mit lila Glow, Karten und Knöpfe
  mit abgeschnittenen Ecken, lila Rahmen, Gold für die aktive Wahl und den Fokus,
  Reiter im erweiterten Modus als goldenes Parallelogramm. Funktionen bleiben gleich.
- Oben auf der Seite steht jetzt die neue 3D-Figur statt des alten Fliegers.
- Das Linksklick-Fenster der Figur bekommt denselben Sternenhimmel.
- Die Stilregeln stehen in `docs/tecmon-style.md` (Repo `tecmon`) und in der `AGENTS.md`.

### Neu in 0.42.0: Pro Looks und Intense Looks

Sechs Pro Looks und acht zusätzliche kräftige **Intense Looks** für Szenen und Branding (insgesamt 50 Filter). Die bisherigen Looks bleiben erhalten. Echte Filter-Testbilder, Originalvergleich und Auswahl je Szene auf der Webseite; die 14 neuen Kennungen nur mit `video-filter-v2`.

### Neu in 0.41.2: Kein CS2-Absturz mehr mit getauschten Skins

- Getauschte Waffen, Messer und Handschuhe bekamen eine Item-ID, die CS2 als
  „Faux-ID“ deutet und daraus eine unsinnige Waffe und Lackierung liest. Das konnte
  CS2 während der Aufnahme abstürzen lassen und die Handschuhe unsichtbar machen.
  Die IDs tragen jetzt eine eigene Markierung, die CS2 nicht so liest.

### Neu in 0.41.1: Killfeed zeigt das getauschte Messer

- Bei Messer-Kills eines Spielers mit getauschtem Messer zeigt der Killfeed jetzt das
  Symbol des neuen Messers, passend zur Seite (T oder CT). Andere Kills und Spieler ohne
  Messer-Wunsch bleiben unverändert.

### Neu in 0.41.0: Eigener Skin-Tausch

- Waffen-Skins, Messer und Handschuhe tauscht jetzt der eigene TecMon-Demo-Rewriter,
  der dem Companion schon beiliegt, zusammen mit Agenten und Hühnern in einem
  Durchgang. Es wird kein fremdes Programm mehr nachgeladen; das Einschalten braucht
  kein Internet.
- Messer und Handschuhe gelten je Seite. Auf der Seite ohne Wunsch bleiben die echten
  Handschuhe, auch nach dem Seitenwechsel. Ein eigenes Messer aus der Demo wird nur auf
  der gewählten Seite ersetzt.
- Alte Skins bekommen weiter das alte Waffenmodell, Sticker der getauschten Waffen
  verschwinden wie bisher (außer mit „Original-Sticker behalten“).

### Neu in 0.40.0: Ohne CS Demo Manager und ohne Datenbank

- Der CS-Demo-Manager-Rückfall ist entfernt. Download und Aufnahme laufen nur noch über die
  eigene TecMon-Engine, die sich in den letzten Versionen bewährt hat.
- Das Setup enthält weder CS Demo Manager noch PostgreSQL und fragt kein Passwort mehr ab.
  Es ist dadurch deutlich kleiner.
- Aufträge ohne Spieler-Slots (sehr alte Auswertungen) bekommen eine klare Meldung:
  Demo auf tecmon.online neu auswerten und erneut senden.
- Der Schalter „Eigene TecMon-Engine verwenden“, „CS Demo Manager öffnen“ und die
  Datenbank-Karte sind aus der Companion-Seite verschwunden.
- Radarbilder für die Rundentipps kopiert der Companion einmalig aus einer älteren
  Installation in seinen eigenen Ordner, damit sie erhalten bleiben.
- Bestehende Installationen behalten die alten Ordner `tools\csdm` und `tools\postgresql`
  sowie die alte Datenbank auf der Festplatte; der Companion startet sie nicht mehr. Wer Platz
  sparen will, kann sie nach dem Update löschen.

### Neu in 0.39.0: Handschuhe bei allen Agenten, Sticker auf Wunsch behalten

- Bei Agenten, deren Handschuh-Einstellung der Companion noch nicht kannte,
  wurde bei zweiteiligen Modellen (z. B. SAS, FBI, SEAL) die falsche Bodygroup
  geraten. Dann blieben die Standard-Handschuhe sichtbar statt der getauschten.
  Jetzt nimmt er wie bei allen bekannten Agenten die letzte Bodygroup.
- Neue Option je Spieler: „Original-Sticker behalten“ (`keepStickers`,
  Capability `skin-stickers-v1`). Ohne sie entfernt der Companion wie bisher
  die Sticker der echten Waffe.

### Neu in 0.38.0: Skins wie im Original, ohne fremde Sticker

- Viele ältere Skins (z. B. Dragon Lore, Howl, Gungnir) sind für das alte
  Waffenmodell gemacht. Die Webseite schickt dafür je Skin `legacy` mit
  (Capability `skin-legacy-v1`), und der Skin-Tausch stellt das passende Modell
  ein. Vorher lag die Textur auf dem neuen Modell und sah verzerrt aus.
- Hatte die echte Waffe Sticker, blieben sie nach dem Tausch drauf. Der eigene
  Rewriter entfernt jetzt die Sticker an allen Waffen mit getauschtem Skin
  (`clear_stickers`); andere Waffen bleiben unverändert.
- Prüfhilfe: `tecmon-demo-rewriter stickers <demo>` listet Waffen mit Stickern je Spieler.

### Neu in 0.37.0: Messer und Handschuhe je Seite

Im Skin-Tausch kann jeder Spieler jetzt als T und als CT ein anderes Messer und
andere Handschuhe bekommen, wie im echten Spiel. Die Webseite schickt dafür je
Eintrag `side` (`"t"` oder `"ct"`, Capability `skin-side-v1`); ohne Seite gilt
die Wahl wie bisher für beide Seiten.

### Neu in 0.36.2: Großer Stack für den Demo-Rewriter

Windows gibt einem Programm im Hauptthread nur 1 MB Stack. Bei großen Demos
endete der Agenten-Tausch deshalb mit „has overflowed its stack“. Der Rewriter
arbeitet jetzt in einem eigenen Thread mit 256 MB Stack.

### Neu in 0.36.1: Agenten-Tausch nach Skin-Tausch

- Scheitert der Agenten-Tausch auf der Skin-Kopie, versucht der Companion die
  umgekehrte Reihenfolge: erst Agenten in der unveränderten Demo (Handschuh-
  Bodygroups schon passend für die getauschten Handschuhe), dann die Skins.
- Das Protokoll zeigt jetzt die echte Fehlerzeile des Rewriters statt
  „keine Antwort“.

### Neu in 0.36.0: Hühner-Rassen und Zeus-Skins

- Huhn-Modus mit den Rassen aus CS2s Haustier-Update: Catalana (13 Farben),
  Polish (12), Silkie (9) und Küken (Capability `chicken-breed-v1`, je Szene
  `chickenLook` mit `breed` und `coat`). Die Farbe ist die Nummer der
  Materialgruppe des Modells; Farbnamen gibt es von Valve nicht. Modellpfade
  stehen nur im Rewriter. Hüte und Accessoires der Haustiere sind nicht dabei.
- Skin-Tausch kennt jetzt auch den Zeus x27.

### Neu in 0.35.0: Huhn-Modus (Experiment)

- Auf der Webseite lässt sich ein Spieler für das ganze Video in ein Huhn
  verwandeln, in Größe 0,5 bis 3 (Capability `chicken-v1`, je Szene
  `chicken`). Der eigene Demo-Rewriter setzt dafür das Huhn-Modell
  (`models/chicken/chicken.vmdl`) und die Größe in eine Kopie der Demo; die
  Original-Demo bleibt unverändert. Zusammen mit „Intro als eigene Szene davor“
  ergibt das ein Huhn-Intro.
- Experiment: Ob Animationen und Kamera mit dem Huhn sauber aussehen, ist noch
  nicht auf echten PCs geprüft.

### Neu in 0.34.0: Demos von Valve über den Companion laden

- Valve liefert Demos nur über http, eine https-Seite darf sie nicht direkt
  laden. Bisher reichte tecmon.online jede Demo über den eigenen Server durch.
  Ist der Companion verbunden, holt jetzt dieser PC die Demo bei Valve und gibt
  sie an den Browser weiter (Capability `demo-fetch-v1`,
  `GET /bridge/demo-fetch?url=`). Erlaubt sind nur Links auf Valves
  Replay-Server, höchstens zwei Downloads gleichzeitig; gespeichert wird nichts.

### Neu in 0.33.2: Linksklick-Fenster mit abgeschnittenen Ecken

- Enthält die Änderung aus 0.32.8 (siehe unten), die noch nicht veröffentlicht
  war: Das Linksklick-Fenster der Figur hat jetzt den TecMon-Stil mit
  abgeschnittenen Ecken.

### Neu in 0.33.1: Update mit Demo-Rewriter repariert

- Die Update-Datei für 0.33.0 brach mit „Unzulässiger Update-Pfad.“ ab, weil
  sie `tecmon-demo-rewriter.exe` nicht einspielen durfte. Die Datei ist jetzt
  erlaubt.
- Die Update-Datei prüft jetzt alle Pfade, bevor sie etwas schreibt; ein
  abgelehnter Eintrag hinterlässt kein halbes Update mehr.

### Neu in 0.33.0: Agenten-Tausch und reparierte Handschuhe

- Neuer eigener TecMon-Demo-Rewriter (`tecmon-demo-rewriter.exe`, Quellcode in
  `native/tecmon-demo-rewriter`). Er liegt dem Companion bei, nichts wird
  nachgeladen.
- Auf der Webseite lässt sich je Spieler ein Agent für T und CT wählen
  (Capability `agent-swap-v1`). Aufgenommen wird aus einer Kopie der Demo, die
  danach gelöscht wird.
- Handschuhe aus dem Skin-Tausch änderten bei manchen Agenten Kopf oder
  Variante, weil feste Bodygroups gesetzt wurden. Der Rewriter stellt die
  Bodygroups jetzt so ein, wie CS2 sie für das jeweilige Modell selbst setzt.
  Die Werte lernt er aus der Original-Demo und merkt sie sich in
  `agent-looks.json`; für noch unbekannte Agenten schätzt er und sagt das im
  Protokoll.

### Neu in 0.32.8: Linksklick-Fenster mit abgeschnittenen Ecken

- Das Fenster, das ein Linksklick auf die Figur oder das Tray-Symbol öffnet,
  hat jetzt denselben TecMon-Stil wie der Setup-Assistent auf tecmon.online:
  Karten, Knöpfe, Reiter, Felder und Listen mit abgeschnittenen Ecken, lila
  Kanten und goldenen Akzenten. Der aktive Reiter ist ein goldenes
  Parallelogramm, die Knöpfe × und − oben im Fenster haben ebenfalls
  abgeschnittene Ecken. Funktionen ändern sich nicht.

### Neu in 0.32.7: Echte cs2.exe wird geprüft

- Der Companion startet und benutzt nur noch eine echte `cs2.exe` von Valve.
  Geprüft wird beim Start, bei der Einrichtung und direkt vor jedem Start von
  CS2 für eine Aufnahme: Verknüpfungen (Symlinks, Junctions) werden bis zur
  echten Datei aufgelöst, Hardlinks abgelehnt, die Datei muss im CS2-Ordner
  einer Steam-Bibliothek neben `appmanifest_730.acf` liegen und eine gültige
  digitale Signatur von Valve tragen. Eine umbenannte andere exe wird so nicht
  mehr gestartet.
- Eine feste Prüfsumme gibt es bewusst nicht, weil sich die `cs2.exe` mit
  jedem CS2-Update ändert. Wird eine Datei abgelehnt, steht der Grund im
  Companion-Fenster bei „CS2“.

### Neu in 0.32.6: Spiele-Reiter aufgeräumt

- Im Companion-Fenster (Linksklick auf die Figur) zeigt der Reiter „Spiele“
  jetzt je Spiel einen aufklappbaren Punkt. Unter „CS2“ liegen sortiert:
  Highlights nach dem Match, Skin-Tausch für Videos, Rundentipps, Fadenkreuz &
  Overlay, Configs und Quiz. Darunter folgt „Dota 2“. Was auf- oder zugeklappt
  ist, merkt sich das Fenster.
- In den Configs sind die Gruppen (Pro, Komfort & Binds, Sound, HUD & Radar,
  Training) Dropdowns mit Anzeige, wie viele davon aktiv sind; die Einträge
  sind alphabetisch sortiert.

### Neu in 0.32.6: Skin-Tausch-Auftrag je Seite

- Messer und Handschuhe gehen jetzt je Seite an den Demo-Rewriter (T: 59/5028, CT: 42/5029).
  Vorher wurden Messer mit „ANY“ übergangen.
- Ein eigenes Messer aus der Demo wird nicht mehr als Quelle mitgeschickt. Der Rewriter lehnte
  das ab und der ganze Skin-Tausch (auch Waffen wie die Scout) schlug fehl; er ersetzt ohnehin
  jedes Messer des Spielers.

### Neu in 0.32.5: Messer-Tausch korrigiert

- Hat der Spieler in der Demo schon ein besonderes Messer und bekommt dasselbe
  Messer mit neuer Lackierung, wird es jetzt auch wirklich getauscht.

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
  das Namensschild „www.TecMon.Online“, damit niemand den Skin für echten Besitz hält.
- Den Tausch machte bis 0.40 ein externer Demo-Rewriter, den der Companion beim
  Einschalten geprüft nachlud. Seit 0.41.0 macht ihn der eigene TecMon-Demo-Rewriter.

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

### Neu in 0.17.2: Fehlerbehebung Video-Übernahme

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

## Demo-Downloads auf der Webseite

Website-PR [#131](https://github.com/KOALAaufPILLEN/tecmon/pull/131) macht direkte Valve-Links im Match-Verlauf und Einrichtungsassistenten sichtbar und kopierbar. Ein leerer Download-Tab gilt nicht als Nachweis, dass Valve keinen Link liefert. Demo-Bytes werden weiterhin nicht über TecMon/Vercel geleitet.

Eine zusätzliche Browser-Erweiterung für lokale Downloads ohne Companion wird im Website-Repository entwickelt (`tools/demo-browser-extension/`), mit Browser-Bildern, Paketen und Anleitung auf `/companion#browser-erweiterung`. Sie ist eine eigenständige Website-Änderung und hier nicht als bereits veröffentlichte Companion-Funktion ausgewiesen. Chromium- und Firefox-Testpakete sind getrennt; Firefox benötigt für dauerhafte Installation noch die Mozilla-Signatur, Safari einen Apple-Build. Aufnahmen in echter CS2-Grafik bleiben Aufgabe des Companion.

Steam-Fehler bei der serverseitigen Ermittlung eines neuen Valve-Links betreffen den eingerichteten Bot-Account, nicht zwangsläufig ein lokal laufendes CS2. Normale Sharecode-Abfragen brauchen weiterhin diesen Bot. Der direkte Steam-Verlauf in Add-on 0.2.0 bietet eine Alternative mit den auf Steam sichtbaren Demo-Links; dabei wird die im Browser angemeldete Steam-Sitzung verwendet, nicht der Nutzer als serverseitiger Bot angemeldet. Ein fehlender oder abgelaufener Valve-Link wird dadurch nicht wiederhergestellt.
