# Regeln für den TecMon Companion

Gilt für alle Änderungen in diesem Repository. Oberflächentexte, Tipps und
README sind auf Deutsch.

## CS2-Rundentipps (Game State Integration)

Die Rundentipps müssen VAC-sicher und für normale Matchmaking-Spiele
unbedenklich bleiben. Diese Grenzen sind verbindlich:

- **Nur lesen, nur offizielle GSI.** CS2 schickt die Daten selbst an
  `127.0.0.1:31977/gsi`. Kein Speicherzugriff, keine Injektion, kein Hook,
  keine Overlays im Spielprozess.
- **Keine Eingaben an das Spiel.** Der Companion sendet nie Maus- oder
  Tastatureingaben, auch keine Recoil-Hilfe oder Makros. Spray-Muster werden
  nur gezeigt.
- **Nur eigene Spielerdaten.** In `gsiConfigText()` (`gsi-config.mjs`) sind
  erlaubt: `provider`, `map`, `round`, `player_id`, `player_state`,
  `player_weapons`, `player_match_stats`, `phase_countdowns`. Verboten sind
  `allplayers_*`, `bomb`, `grenades`, `player_position` und alles, was
  Gegnerinformationen liefert. Der Test in `test/game-tips.test.mjs` prüft das
  und darf nicht gelockert werden.
- **Kein Bomben-Timer.** Von `phase_countdowns` wird nur der
  Kaufzeit-Countdown ausgewertet.
- **Standardmäßig aus.** Die cfg-Datei `gamestate_integration_tecmon.cfg`
  wird nur nach Einschalten angelegt, mit eigenem zufälligem Token, und beim
  Ausschalten wieder entfernt. Während einer Demo-Aufnahme werden GSI-Daten
  ignoriert.

### Wann der Companion spricht

- Tipps kommen in der Kaufzeit (`freezetime`), höchstens `BRIEFING_LIMIT` (3)
  pro Kaufzeit. Der Kauf-Check kommt vor Ende der Kaufzeit.
- Sobald die Runde `live` ist, wird die Warteschlange geleert (nur
  Zusammenfassung und Tod-Tipps bleiben) und die Sprechblase blendet sich aus,
  solange der Spieler lebt (`quiet`). Neue Tipps dürfen das nicht unterlaufen.
- Erlaubte Zeitpunkte sonst: nach dem eigenen Tod, zur Halbzeit, am
  Matchende.

### Funktionen und Optionen

- Jede Tipp-Kategorie gehört zu genau einer Funktion in `FEATURES`
  (`game-tips.mjs`). Eine neue Kategorie braucht einen Eintrag dort, sonst lässt
  sie sich nicht abschalten. Reine Anzeige-Optionen ohne Kategorie (etwa
  `stack`, große Sprechblase) stehen ebenfalls dort; `TecMon.cs` liest sie aus
  `gsi.features`.
- Funktionen sind einzeln abschaltbar, auf der Companion-Seite
  (`/api/gsi/features`) und im Figurmenü „Games → CS2 → Rundentipps“ (`TecMon.cs`).
  Gespeichert in `gsi.json`; nicht gespeicherte Funktionen gelten als an.

### Daten von der Webseite (`insights-v1`)

- Die Webseite schickt aus „Meine Stats“ eine Zusammenfassung an
  `POST /bridge/insights`. Aufbau: `version: 1`, 17-stellige `steamId`,
  `maps` (max. 20) mit `matches`, `won`, `tRounds`, `tWon`, `ctRounds`, `ctWon`
  und `deaths` als `[x, y, Seite]` (0 = T, 1 = CT, -1 = unbekannt, max. 400).
  `cleanInsights()` prüft und kürzt alles.
- Die Daten bleiben lokal in `insights.json` (Modus 600, max. 4 Konten) und
  verlassen den PC nie. Sie lassen sich in der Oberfläche löschen.
- `insights-v2` (`version: 2`) ergänzt je Map optional `habits`: nur Summen des
  eigenen Spielers (`HABIT_KEYS` in `insights.mjs` und `game-tips.mjs`), etwa
  Eröffnungsduelle, getradete Tode, K/D und Allein-Zeit je Seite, Bombe,
  Laufschüsse, Kopftreffer, Granaten, Flashes, Teamschaden, Clutches, Kills nach
  Sieg/Niederlage, dazu `weapons` (max. 8, `[Kills, Headshots, Schüsse,
  Treffer]`). `habits.matches` zählt nur
  Matches mit vollständigen Zählern. Daten anderer Spieler kommen nie hinein.
  `insights-v1` bleibt angeboten; v1-Übertragungen haben keine `habits`.
- Tipps daraus (`habitAdvice()`) kommen zum Seitenstart und in Runden mit
  `round % 4 === 2` (dann mit niedriger Priorität), jeder Tipp nur einmal pro
  Match, und brauchen Mindestmengen an Daten. Das `BRIEFING_LIMIT` gilt weiter.
- Änderungen am Aufbau nur abwärtskompatibel oder mit neuer Capability
  (`insights-v3`) und gleichzeitiger Anpassung der Webseite
  (`lib/demoReplay/companionInsights.ts` im Repo `tecmon`).

### Karten und Bilder

- Radarbilder werden nie mitgeliefert oder heruntergeladen. `copyRadars()`
  (`radars.mjs`) kopiert sie beim Start nur aus einem schon vorhandenen
  CS-Demo-Manager-Ordner (alte verwaltete Installation oder eigenes Programm,
  `resources/static/images/maps/cs2/radars/<map>.png`) in `<profil>/radars`;
  das Programm wird nie gestartet. Fehlt das Bild, kommt nur Text.
- Callouts und Radar-Metadaten stehen in `map-spots.mjs` als Anteile des
  1024er-Radars. Spray-Muster in `spray-patterns.mjs` stammen aus
  `lib/recoilProfiles.ts` der Webseite.

## Dota-2-Tipps (`dota-gsi.mjs`, `dota-tips.mjs`)

Gleiche Grenzen wie bei CS2, verbindlich:

- **Nur offizielle GSI, nur lesen, keine Eingaben.** Dota 2 schickt an
  `127.0.0.1:31977/gsi/dota2`, eigenes Token in `dota2/gsi.json`. Erlaubt sind
  nur `DOTA_GSI_BLOCKS` (`provider`, `map`, `player`, `hero`, `items`).
  Verboten: `buildings`, `minimap`, `roshan`, `couriers`, `draft`,
  `neutralitems`, `events`, `league`, `wearables`, `abilities` und alles mit
  Gegner- oder Teamdaten. `test/dota-tips.test.mjs` prüft das und darf nicht
  gelockert werden.
- `cleanDotaPayload()` verwirft Nachrichten mit `team2`/`team3` (Zuschauer,
  Replay) und behält nur die eigenen Werte. Keine Timer für Roshan oder
  gegnerische Buybacks.
- **Nur in Pausen:** Strategiephase/Pre-Game, Spielpause, nach dem eigenen Tod,
  Matchende. Lebend im laufenden Spiel `quiet` und Warteschlange leeren.
  `BRIEFING_LIMIT` (3) je Pause. Jede Kategorie gehört zu `DOTA_FEATURES`.
- Standardmäßig aus; cfg nur nach Einschalten, beim Ausschalten und beim
  Entfernen des Pakets löschen. Während einer Demo-Aufnahme nichts annehmen.

## Browser-Bridge

- `/bridge/*` nur mit geprüftem Origin und Bridge-Token. Neue Funktionen
  bekommen eine eigene Capability in `/bridge/state`; bestehende Capabilities
  nicht ändern oder entfernen, weil ältere Webseiten-Versionen darauf prüfen.
- Größenlimits für Eingaben (`readInput(req, limit)`) immer setzen.
- Demo-Download für die Webseite (`demo-fetch-v1`, `demo-fetch.mjs`): nur Links, die
  `REPLAY_URL` erfüllen, ohne Weiterleitungen, höchstens `MAX_PARALLEL` gleichzeitig und
  `MAX_FETCH_BYTES` groß. Nichts speichern; die Webseite entpackt selbst.

## Windows-Figur (`windows/TecMon.cs`)

- Wird mit dem .NET-Framework-4-`csc` gebaut: nur C# 5. Kein `$"…"`, kein
  `?.`, keine Ausdruckskörper.
- Lokale Prüfung: `mcs -langversion:5 -target:winexe -r:System.Windows.Forms.dll
  -r:System.Drawing.dll -r:System.Web.Extensions.dll -r:Microsoft.CSharp.dll
  -r:System.Core.dll -r:System.IO.Compression.dll
  -r:System.IO.Compression.FileSystem.dll -out:/tmp/t.exe TecMon.cs`
- Die Sprechblase nimmt CS2 nie den Fokus.
- Die 3D-Figur ist ein vorab gerendertes Sprite-Sheet
  (`public/desktop-bot-3d.png`, Ressource `TecMonBot3D`, Pipeline in
  `scripts/figure-3d/`). Kein 3D-Renderer im Companion. Figur und Sprechblase
  zeichnen per Pixel-Alpha (`Layered.Push`), nicht über `Region`.

## Persönlichkeit und TecMon-Werte (`personality.mjs`)

- Modi `nett`, `normal`, `nerdy`, `huan` ändern nur den Ton
  (`flavorTip()` setzt einen Satzanfang vor den Tipp). Inhalt, Kategorien,
  Zeitpunkte und `BRIEFING_LIMIT` der Rundentipps bleiben unverändert.
- Der HUAN-Modus stichelt nur über das eigene Spiel, keine Beleidigungen von
  Personen oder Gruppen. Derbe Sprache über Aim, Waffenwahl, Quiz-Wissen und
  Spielweise ist erlaubt, weil HUAN als „ab 18“ markiert ist und vor dem
  Einschalten bestätigt werden muss (Figurmenü, Schnellmenü und Seite). Keine
  Witze über Krankheiten, Behinderungen, Herkunft, Geschlecht oder soziale Lage.
- Waffen-Sprüche (`WEAPON_OPENERS`) erkennen die Waffe nur am Anfang des
  Spray-Tipps; `pick()` vermeidet direkte Wiederholungen.
- Leerlauf-Sprüche (`idle`) kommen nur ohne Aufnahme, wach, bei geschlossenem
  Menü und ohne CS2 oder Dota 2 im Vordergrund, höchstens alle 4–7 Minuten.
- Werte und Zähler bleiben lokal in `pet.json`; Spiele laufen nur in der
  Companion-Oberfläche, nie im Spiel.

## Spiel-Pakete (`games.mjs`)

- Jedes Spiel ist ein Paket in `GAME_CATALOG`. Ohne gespeicherte Auswahl ist
  CS2 installiert; die Auswahl liegt in `games.json`.
- Ist ein Paket entfernt, legt der Companion für dieses Spiel keine Dateien an
  und nimmt keine Daten an (`/gsi`, `/bridge/insights`, `/api/gsi/*`,
  `/api/crosshair/*` antworten mit Fehler). Entfernen löscht nur eigene
  Dateien des Pakets. Neue spielbezogene Funktionen gehören zu einem Paket und
  müssen beim Entfernen mit aufgeräumt werden.
- Dota 2 ist seit 0.22.0 verfügbar (`/gsi/dota2`, `/api/dota2/*`).
- Geplante Spiele (`status: "planned"`) lassen sich nicht installieren, bis es
  echte Funktionen dafür gibt.
- Die Highlight-Aufnahme gehört zum Companion, nicht zu einem Paket.

## Clip-Puffer (`clips.mjs`, `clip-branding.mjs`)

- Gehört zum Companion, nicht zu einem Spiel-Paket. Standardmäßig aus
  (`clips.json`). Nur Bildschirmaufnahme per FFmpeg `ddagrab`; kein Hook, keine
  Injektion, kein Overlay im Spiel, kein Mitlesen der Tastatur. Die Figur
  registriert nur Strg+Alt+C (`RegisterHotKey`) und zeigt Rückmeldungen als
  Windows-Hinweis, ohne den Fokus zu nehmen.
- Der Ringpuffer (`Clips/puffer`) enthält Bildschirminhalt: beim Ausschalten,
  Beenden und Start löschen. Argumente für FFmpeg nur als Liste, nie über eine
  Shell; der Ton-Gerätename wird bereinigt.
- Die Bridge gibt nur Clips mit TecMon-Branding heraus (`GET /bridge/clip`),
  nie Rohclips. Capability `clips-v1`: `GET /bridge/clips`,
  `GET /bridge/clip?id=`, `POST /bridge/clips/brand` (`id`, `game` aus
  `CLIP_GAMES`, `title` max. 80 Zeichen).
- Keine Live-Auswertung des Bildschirms im Spiel. Eine spätere KI-Analyse nur
  für fertige Clips, nur mit dem eigenen API-Schlüssel des Nutzers und nur
  nach ausdrücklichem Einschalten.

## Filter und HUD v2 (`video-filters.mjs`, `cyber-hud.mjs`)

- Filter kommen nur als Kennung aus `VIDEO_FILTERS`; `filterId()` verwirft alles
  andere. Keine Filterketten oder Ausdrücke aus dem Auftrag übernehmen. Die Liste
  muss zu `lib/videoFilters.ts` der Webseite passen (Capability `video-filter-v1`).
- Szenenfilter wirken nur auf das Gameplay vor dem HUD; `branding.filter` nur auf
  Intro, Titelbild, Spielerwechsel und Outro.
- HUD v2 nur, wenn das geprüfte Video-Paket `hud-v2.png` enthält.
- Kill-Anzeige (`kill-badge-v1`): je Szene `kills` als `[Tick, Kill-Nummer in der Runde,
  Kopfschuss 0/1]`, höchstens 10, aufsteigend, innerhalb der Szene (`killMarks()` in
  `job.mjs`). Die Wörter kommen nur aus `killWords()`, nie aus dem Auftrag.
- Deathcam-Schriftzug (`deathcam-label-v1`): je Szene optional `deathcam` mit dem Namen des
  Sterbenden (höchstens 32 Zeichen, bereinigt in `validateJob()`). `deathcamBar()` in
  `cyber-hud.mjs` zeichnet das feste Wort „DEATHCAM:“; der Name kommt nur aus einer gesperrten
  Textdatei, nie als Filterausdruck.

## Skin-Tausch für Videos (`skin-swap.mjs`)

- Freiwilliges Addon, standardmäßig aus (`skin-swap.json`), Einschalten nur nach
  bestätigtem Hinweis (`SKIN_NOTICE`, Version `SKIN_NOTICE_VERSION`). Capability
  `skin-swap-v1` nur, wenn es an ist, die eigene Engine läuft und der mitgelieferte
  `tecmon-demo-rewriter.exe` da ist.
- Seit 0.41 tauscht nur der eigene Rewriter (`native/tecmon-demo-rewriter/src/skins.rs`, MIT),
  im selben Durchgang wie Agenten (`agentRequest(..., { skins: true })`, `skinPlan()`). Nichts
  nachladen, keine DLL in CS2. Keinen Code aus anderen Skin-Tauschern (etwa CS2-nskinz,
  AGPL-3.0) übernehmen; die Idee darf genannt werden, Links dorthin nicht.
- Aus dem Auftrag nur `sequences[].skins` mit Zahlen (`cleanSkins()`: Waffe aus
  `SKIN_WEAPONS`, Paintkit, Abnutzung, Muster, höchstens `MAX_SKINS`). SteamID64
  bleibt Text. Aufgenommen wird aus einer Kopie `*.tecmon-swap.dem`, die danach
  gelöscht wird; die Original-Demo bleibt unverändert.
- Getauschte Waffen, Messer und Handschuhe tragen das Namensschild „TecMon Skin“ und eine
  markierte Item-ID (oberste vier Bits gesetzt).
- Die Webseite darf den Schalter über `GET/POST /bridge/skins` bedienen (Capability
  `skin-swap-setup-v1`, nur mit installiertem Companion und eigener Engine). Einschalten
  nur mit `accept` gleich `SKIN_NOTICE_VERSION`; die Webseite zeigt dafür `SKIN_NOTICE`.
- `skin-swap-v2` (nur zusammen mit `skin-swap-v1`): je Szene höchstens ein Messer aus
  `SKIN_KNIVES` (Skin-ID 0 = ohne Lackierung, `from` wird angenommen, aber nicht gebraucht) und
  ein Handschuh aus `SKIN_GLOVES`. Der Rewriter ersetzt jedes Messer des Spielers auf der Seite
  (Modellpfade fest in `KNIVES` in `skins.rs`) und `m_EconGloves` des Pawns.
- `skin-side-v1` (nur zusammen mit `skin-swap-v2`): Messer und Handschuhe optional mit `side`
  (`"t"`/`"ct"`, `SKIN_SIDES`); ohne `side` beide Seiten. Seite eines Messers: Träger, sonst Team
  des Besitzers. Auf der Seite ohne Handschuh-Wunsch stellt der Rewriter die echten Handschuhe
  nach einem Seitenwechsel wieder her. Pro Spieler und Seite eins.
- Killfeed: Bei Messer-Kills eines Spielers mit getauschtem Messer schreibt der Rewriter im Ereignis
  `player_death` nur `weapon` (Name aus `KILLFEED` in `skins.rs`), `weapon_itemid` und
  `weapon_fauxitemid` um; Angreifer und Seite kommen aus Pawn bzw. Controller. Andere Ereignisse
  und Felder bleiben unverändert.
- `skin-legacy-v1`: Waffen-Skins optional mit `legacy` (0/1, nicht bei Messer/Handschuh). Dann geht
  `m_MeshGroupMask` auf 2 (altes) bzw. 1 (neues Waffenmodell); ohne Angabe nichts.
- Sticker der echten Waffe entfernt der eigene Rewriter (`clear_stickers` je Spieler: Item-Definitionen
  der Waffen mit getauschtem Skin). Er setzt nur die Sticker-ID-Attribute (113, 117, …) auf 0, sonst nichts;
  `compare` ignoriert diese Werte und die Skin-Felder (`is_skin_field()`). Mit `keepStickers: true` je Szene (`skin-stickers-v1`) bleiben sie.

## Agenten-Tausch (`agent-swap.mjs`, `native/tecmon-demo-rewriter`)

- Eigener Rewriter in Rust (MIT) auf Basis von source2-demo (MIT/Apache-2.0,
  Kopie in `native/tecmon-demo-rewriter/vendor`, Änderungen mit „TecMon:“
  markiert). Kein Code aus anderen Skin-Tauschern übernehmen. Die Release-Pipeline baut ihn
  mit `cargo build --locked`; er liegt als `tecmon-demo-rewriter.exe` neben den
  `.mjs`-Dateien. Capability `agent-swap-v1` nur, wenn die Datei da ist und die
  eigene Engine läuft.
- Aus dem Auftrag nur `sequences[].agents` als `{ t?, ct? }` mit Nummern aus
  `AGENTS` der passenden Seite (`cleanAgents()`); Modellpfade stehen nur im
  Companion. Pro Spieler und Seite ein Agent je Video. SteamID64 bleibt Text.
- Aufgenommen wird aus `*.tecmon-swap.dem`, danach gelöscht. Bei getauschten Handschuhen
  wählt der Rewriter je Seite die Bodygroups „mit Handschuhen“ passend zum Agenten.
- Huhn-Modus (`chicken-v1`, Experiment): je Szene `chicken` als Zahl von `CHICKEN_MIN` bis
  `CHICKEN_MAX` (`cleanChicken()`), pro Spieler eine Größe je Video. Der Rewriter setzt nur das feste
  Modell `models/chicken/chicken.vmdl`, Mesh-Maske, Bodygroups wie die Hühner der Karte und
  `m_flScale`; kein Modellpfad aus dem Auftrag.
- Huhn-Rassen (`chicken-breed-v1`, nur zusammen mit `chicken`): je Szene `chickenLook`
  als `{ breed, coat }`, `breed` aus `CHICKEN_BREEDS` (`cleanChickenLook()`), `coat` = Nummer der
  Materialgruppe (0 = Standard, kleiner als die Farbzahl der Rasse). Der Rewriter kennt die
  festen Modelle in `CHICKEN_BREEDS` (main.rs) und setzt `m_materialGroup` als String-Token der
  Nummer; nie Pfade oder Gruppennamen aus dem Auftrag. Pro Spieler ein Huhn je Video.
- Bodygroups und Mesh-Maske nie fest setzen: aus der Original-Demo lernen
  (`learn`), lokal in `agent-looks.json` merken, nur für unbekannte Modelle
  schätzen und das melden (`guessed`).
- Vor Änderungen am Rewriter mit einer echten Demo prüfen:
  `tecmon-demo-rewriter compare original.dem umgeschrieben.dem` muss ohne
  Abweichung außerhalb der Modellfelder enden.

## Highlight-Video nach dem Match (`auto-highlights.mjs`)

- Standardmäßig aus (`auto-highlights.json`). Eingeschaltet braucht es die
  GSI-Datei; sie bleibt, solange Rundentipps oder Auto-Highlights an sind.
  Gelesen werden nur `map.name`, `map.mode`, `map.phase` und
  `provider.steamid`; während einer Aufnahme nichts annehmen.
- Gefragt wird nur nach einem fertigen Match (`gameover`) in `DEMO_MODES`:
  sobald GSI seit `MENU_MS` ohne Map kommt (Hauptmenü) oder `QUIET_MS` lang
  gar nichts mehr kommt. Die Frage (`AutoPrompt` in `TecMon.cs`) ist ein
  eigenes TecMon-Fenster, das nie aktiviert wird und CS2 keinen Fokus nimmt;
  kein `MessageBox`.
- Nach „Ja“ wartet der Lauf (`waiting`), bis die Spiel-Exe aus `GAME_EXES`
  nicht mehr läuft (`tasklist`, höchstens alle `RECHECK_MS`), weil Steam die
  Match-Infos nur ohne CS2 liefert. Kein Zugriff auf den Spielprozess. Ein
  neues Spiel braucht einen Eintrag in `GAME_EXES`.
- `state()` zeigt zur Fehlersuche nur `gsiAgo`, zuletzt gesehene Map/Modus/Phase
  und das erkannte Match, keine weiteren Spieldaten.
- Dann: `downloadLatestDemo()` (boiler-writter ohne Match-Angaben =
  letzte Matches des angemeldeten Kontos), dann die zuletzt verbundene
  TecMon-Seite öffnen. Bridge: `GET /bridge/auto?id=` (Status, Map, eigene
  SteamID, keine Pfade), `GET /bridge/auto/demo?id=`, `POST /bridge/capture`
  mit `autoId` statt `demoId`; die Demo gilt danach als verbraucht.
- Hochladen zu YouTube/Discord macht nur die Webseite mit den Einstellungen im
  Browser. Der Companion bekommt dafür keine Zugangsdaten.

## Fadenkreuz, Overlay und CFG-Sammlung (`crosshair.mjs`, `cfg-library.mjs`)

- Fadenkreuz-Editor und CFG-Sammlung schreiben nur eigene cfg-Dateien
  (`tecmon_crosshair.cfg`, `tecmon_cfg_<id>.cfg`) mit CS2-eigenen Befehlen in den
  CS2-cfg-Ordner. Der Spieler lädt sie selbst per `exec`. Fremde cfgs (autoexec usw.)
  nie ändern oder löschen.
- Die Sammlung ist eine feste Liste in `CFG_CATALOG`. Kein freier Text aus der
  Oberfläche in Befehlen; Bind-Tasten nur aus `BIND_KEYS`. Keine Sensitivity, keine
  Aliase/Skripte, keine Binds mit mehreren Bewegungs- oder Schussbefehlen. Pro-Werte
  mit Quelle und Stand angeben; Profis ändern sie, also nicht als „aktuell garantiert“
  darstellen. `test/cfg-library.test.mjs` prüft die erlaubten Befehle.
- Fadenkreuz-Overlay (`CrosshairOverlay` in `TecMon.cs`): eigenes, durchklickbares
  Fenster (`WS_EX_TRANSPARENT`, nie aktiviert) außerhalb des CS2-Prozesses. Kein Hook,
  keine Injektion, kein Speicherzugriff, keine Eingaben. Standardmäßig aus;
  einschalten nur nach bestätigtem Hinweis (`OVERLAY_NOTICE`, Version
  `OVERLAY_NOTICE_VERSION`: eigenes Risiko, keine Haftung, andere Anti-Cheats können
  Overlays verbieten). Ändert sich der Hinweis inhaltlich, Version erhöhen, dann muss
  neu bestätigt werden.
- Sichtbar nur im Vollbild-Fenstermodus: Der Server liest den Modus aus CS2s
  `cs2_video.txt` (`cs2WindowMode()`), die Figur prüft zusätzlich, dass CS2 vorn liegt
  und sein Fenster rahmenlos bildschirmgroß ist. Im echten Vollbild oder Fenster bleibt
  das Overlay aus. Beim Entfernen des CS2-Pakets werden Overlay-Einstellung und alle
  Sammlungs-cfgs gelöscht.

## Oberfläche (Figurmenü, Fenster, Companion-Seite)

- TecMon-Stil (wie `docs/tecmon-style.md` der Webseite, im README unter „TecMon-Stil“):
  abgeschnittene Ecken statt Rundungen (`clip-path`, `border-radius: 0`, `--cut`/`--edge`/`--fill`),
  eckige Eingabefelder, Lila für Rahmen und Kanten, Gold für die aktive Wahl, Fokus und die
  zwei Hauptecken großer Karten; Statuspunkte als Raute, Reiter als Parallelogramm.
  Neue Stilregeln dort und im README eintragen.
- Gleiche UI-Regeln wie auf tecmon.online: TecMon-Farben (Schwarz, Lila, Gold),
  Buttons mit Hover nur bei Maus und sichtbarem Nachgeben beim Drücken
  (`scale(0.96)`, nie unter 0.95), breite Karten ändern nur die Farbe.
  Übergänge nur mit benannten Eigenschaften und den `--tm-dur-*`-Zeiten, nie
  `transition: all`. Esc schließt Rückfragen; Trefferflächen mindestens 40 px.
- Rechtsklick auf die Figur öffnet `QuickMenu` (`OpenQuick()`/`BuildQuick()` in
  `TecMon.cs`): Kacheln, Schalter, Persönlichkeit, „Alle Optionen …“ öffnet das
  vollständige `ContextMenuStrip` (auch am Tray-Symbol). Neue häufige Funktionen
  dort ergänzen, alles andere im vollständigen Menü. Dessen Einträge zeichnet
  `TecMonMenu` als Buttons. Keine Windows-Standarddialoge für Fragen während
  des Spiels.
- Fortschritt beim Video: `/api/state` liefert `work` aus `workState()` (`work-status.mjs`),
  nur Status, Schritt und feste Texte, keine Pfade oder Protokollzeilen. `ShowWork()` in
  `TecMon.cs` zeigt ihn als stehende Sprechblase (`Present(..., sticky)`), „Fertig“ nur für
  einen selbst gesehenen Auftrag.
- Das Linksklick-Fenster (`?desktop=1`) gruppiert die Karten in Reiter
  (`desktopSections()` in `public/app.js`). Neue Karten dort einer Gruppe zuordnen.

## Prüfen und veröffentlichen

- Vor jedem Push `npm test` und `node scripts/version.mjs check` im Repo-Stamm.
- Version nur gemeinsam erhöhen: `node scripts/version.mjs set X.Y.Z`. Jeder
  Merge auf `main` mit neuer Version veröffentlicht automatisch ein Release
  (siehe [BUILDING.md](BUILDING.md)); installierte Companions bekommen es als
  Update. Darum nur mit Freigabe mergen.
- Neue Funktionen im README unter „Neu in X.Y.Z“ beschreiben.
- Nach jedem Merge die betroffenen README-Dateien beider Repositories (`tecmon-companion`
  und `tecmon`) auf den neuen Stand bringen, samt Stand-Zeile oben im README und der
  Capability-Tabelle. Neue Regeln schriftlich im Repo festhalten (AGENTS.md), nicht nur im Chat.
- Automatische Updates (`autoUpdateTick()` in `server.mjs`) nutzen dieselbe
  Prüfung wie der Knopf (`checkUpdate()`/`downloadUpdate()`), laufen nie bei
  aktivem Download oder aktiver Aufnahme und sind über `/api/update/auto`
  abschaltbar.

## Eigene TecMon-Engine (`internal-recorder.mjs`, `valve-download.mjs`)

- Download und Aufnahme laufen nur über die eigene Engine, ohne
  CS-Demo-Manager-Programm und ohne PostgreSQL (seit 0.40 kein Rückfall mehr,
  kein Passwort im Setup). Keinen CSDM- oder Datenbank-Weg wieder einbauen.
  Aufträge ohne `slot` je Szene lehnt `internalProblem()` mit `SLOTS_MISSING`
  ab (Bitte um neue Auswertung auf der Webseite).
- Alte Installationen behalten `tools\csdm`, `tools\postgresql` und ihren
  Datenbank-Cluster; der Companion startet sie nicht und löscht sie nicht
  ungefragt. `PrepareUpdate()` in `TecMon.cs` beendet einen noch laufenden
  alten Cluster vor dem Update weiter, falls `installation.json` ihn nennt.
- Fremde Binärdateien nur mit fester Prüfsumme: CS2-Plugin über
  `PLUGIN_SHA256` (`recording-engine.mjs`), boiler-writter über die
  npm-Integrität in `BOILER`. Bei Abweichung abbrechen, nie ungeprüft starten.
- Die `cs2.exe` nur nach `checkCs2Exe()` (`cs2-verify.mjs`) benutzen oder starten:
  Links aufgelöst, kein Hardlink, CS2-Ordner einer Steam-Bibliothek mit
  `appmanifest_730.acf`, gültige Authenticode-Signatur von Valve. Keine feste
  Prüfsumme der cs2.exe (bricht bei jedem Update). Neue Stellen, die CS2 starten,
  prüfen direkt davor erneut; nicht lockern.
- CS2 nie beenden: Läuft CS2 schon, bricht die Aufnahme ab. In `gameinfo.gi`
  nur die eigene Zeile ergänzen und wieder entfernen.
- Befehle in der Aktionsdatei entstehen nur aus geprüften Zahlen und
  bereinigten Namen des Auftrags, nie aus freiem Text der Webseite.
- Das HLAE-Kameraskript (`camera-script.mjs`) bekommt nur den Zahlenplan aus
  `scriptPlan()`; `scriptSource()` prüft ihn. Es läuft nur bei der
  Offline-Demo-Wiedergabe, nie im Live-Match. „Kamera im Spiel setzen“ ändert
  nur den eigenen CS2-Konfigurationsordner (`hlae-config`) und liest
  `console.log`, ohne sie zu löschen. Capabilities: `camera-script-v1`
  (Schnitte `path`/`follow`), `camera-session-v1` (`POST /bridge/camera`), `camera-angle-v1` (optionaler
  Startwinkel `angle` bei `follow`, ohne Angabe 0).
