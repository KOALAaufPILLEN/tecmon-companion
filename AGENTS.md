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
  (`/api/gsi/features`) und im Figurmenü „CS2-Rundentipps“ (`TecMon.cs`).
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

- Radarbilder werden nie mitgeliefert oder heruntergeladen. Sie werden lokal
  aus der mitinstallierten CS-Demo-Manager-Version gelesen
  (`resources/static/images/maps/cs2/radars/<map>.png`). Fehlt das Bild, kommt
  nur Text.
- Callouts und Radar-Metadaten stehen in `map-spots.mjs` als Anteile des
  1024er-Radars. Spray-Muster in `spray-patterns.mjs` stammen aus
  `lib/recoilProfiles.ts` der Webseite.

## Browser-Bridge

- `/bridge/*` nur mit geprüftem Origin und Bridge-Token. Neue Funktionen
  bekommen eine eigene Capability in `/bridge/state`; bestehende Capabilities
  nicht ändern oder entfernen, weil ältere Webseiten-Versionen darauf prüfen.
- Größenlimits für Eingaben (`readInput(req, limit)`) immer setzen.

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
  Personen oder Gruppen.
- Werte und Zähler bleiben lokal in `pet.json`; Spiele laufen nur in der
  Companion-Oberfläche, nie im Spiel.

## Prüfen und veröffentlichen

- Vor jedem Push `npm test` und `node scripts/version.mjs check` im Repo-Stamm.
- Version nur gemeinsam erhöhen: `node scripts/version.mjs set X.Y.Z`. Jeder
  Merge auf `main` mit neuer Version veröffentlicht automatisch ein Release
  (siehe [BUILDING.md](BUILDING.md)); installierte Companions bekommen es als
  Update. Darum nur mit Freigabe mergen.
- Neue Funktionen im README unter „Neu in X.Y.Z“ beschreiben.
- Automatische Updates (`autoUpdateTick()` in `server.mjs`) nutzen dieselbe
  Prüfung wie der Knopf (`checkUpdate()`/`downloadUpdate()`), laufen nie bei
  aktivem Download oder aktiver Aufnahme und sind über `/api/update/auto`
  abschaltbar.

## Eigene TecMon-Engine (`internal-recorder.mjs`, `valve-download.mjs`)

- Download und Aufnahme laufen ohne CS-Demo-Manager-Programm und ohne
  PostgreSQL. Der CSDM-Weg bleibt als Rückfall erhalten, bis die eigene Engine
  auf echten PCs freigegeben ist; Aufträge ohne `slot` je Szene nutzen ihn
  automatisch.
- Fremde Binärdateien nur mit fester Prüfsumme: CS2-Plugin über
  `PLUGIN_SHA256` (`recording-engine.mjs`), boiler-writter über die
  npm-Integrität in `BOILER`. Bei Abweichung abbrechen, nie ungeprüft starten.
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
