# Pro Looks · 17. November 2026

Auf Basis von Companion `a0c73846aabd046bb93416d7045d7c8b3ca92c25` (0.41.1) und Webseite `e6163e7b088aa628f8399d323ffc15f7796fa48f`. Die frühere lokale Arbeit an PR #29 wurde nicht darüberkopiert. Die aktuelle Aufnahme-Engine, Skin-/Agenten-Tausch, Stil A/B und das vorhandene Branding bleiben erhalten.

## Pro und Intense Looks

| Kennung | Bildwirkung |
|---|---|
| `arena-pro` | Natürliche Farben, etwas mehr Zeichnung und feine Schärfe |
| `cinema-pro` | Kühle Schatten, warme Lichter, sanfte Filmkurve |
| `tecmon-prime` | Violette Schatten, goldene Lichter, kräftigere Farbakzente |
| `frostfire` | Stärkerer Kalt-Warm-Kontrast, Blau gegen warme Lichtquellen |
| `silverprint` | Weniger Sättigung, kühle metallische Schatten |
| `halation` | Warmer Filmlook mit dezentem Lichtschein nur aus hellen Pixeln |

Die Filmkurve öffnet dunkle Bereiche leicht und rundet helle Bereiche ab. `colorbalance` erhält die Helligkeit (`pl=1`). Kein künstliches Wackeln, keine Frame-Interpolation, keine schwarzen Balken und kein Beschnitt. Das sind SDR-Looks, kein echtes HDR. Halation verzweigt nach der Farbkorrektur: nur Pixel oberhalb von 190/255 speisen den weichgezeichneten Screen-Anteil (16 %). Die Unschärfe skaliert mit der Bildbreite. Der gesamte dunkle Bildanteil wird nicht weichgezeichnet.

## Integration und Kompatibilität

`video-filters.mjs` enthält ausschließlich fest definierte Filterketten. Der Browser überträgt nur bekannte Kennungen; freie FFmpeg-Ausdrücke und geerbte Objektschlüssel wie `constructor` werden verworfen. `filterGraph()` und `withFilter()` prüfen selbst ebenfalls gegen die Liste.

Die bisherigen sechs Pro Looks bleiben erhalten. Acht kräftigere Intense Looks ergänzen sie (insgesamt 50 Filter).

Der Companion meldet zusätzlich `video-filter-v2`. Die Webseite zeigt die neue Gruppe nur damit an. `video-filter-v1` und seine 36 bisherigen Filter bleiben unverändert. `companionVideoFilter()` prüft beim Erstellen des Auftrags erneut, damit auch gespeicherte Stile und Auto-Highlights keine Pro-Kennung an einen älteren Companion schicken. Szenenwahl, Einzelszenen, Intro-Szenen und Branding benutzen dieselbe Prüfung.

Szenenfilter laufen vor den **zusätzlichen TecMon-Einblendungen**. Das bereits aufgenommene native CS2-HUD gehört zum Rohbild und erhält deshalb den Look mit. Ein Branding-Filter bleibt separat für Intro, Spielerwechsel und Outro wählbar. Der allgemeine Clip-Puffer bekommt in dieser Änderung keine neue Filterauswahl.

Für die 14 Pro/Intense Looks verwendet die Webseite echte vorgerenderte FFmpeg-Testbilder unter `public/video-filters/v2/`; die alten Filter behalten ihre CSS-Nachbildung. Der Originalvergleich verändert die getroffene Auswahl nicht. Die öffentlichen Testbilder werden ausschließlich aus `public/marketing/generated/card-cs-v2.webp` erzeugt, nie aus Nutzeraufnahmen. Sie sind eine Filtervorschau auf einer Illustration, keine Gameplay-Simulation. Die sechs bisherigen öffentlichen Assets bleiben erhalten; die acht neuen ergänzen sie, keine neue Browser-Bibliothek.

## Lokale Vorschauen

```powershell
npm ci
node scripts/preview-video-filters.mjs C:\Tools\ffmpeg.exe C:\Videos\fertige-aufnahme.mp4 dist/filter-review C:\Repos\tecmon
# Optional fünftes Argument: vorhandener nativer Render-Helfer/Companion
node scripts/preview-video-filters.mjs C:\Tools\ffmpeg.exe C:\Videos\fertige-aufnahme.mp4 dist/filter-review-locked C:\Repos\tecmon C:\Tools\TecMon-Companion.exe
```

Ausgabeordner müssen neu sein. Die Originaldatei wird nur gelesen; eine geprüfte lokale Kopie garantiert dieselben Frames für alle Vergleiche. Die Aufnahme muss mindestens drei Sekunden lang sein. Ausgabe: Original plus 14 3-s-MP4s, Standbilder, Vergleichstafel und `index.html`. Mit fünftem Argument zusätzlich ein echter Export aller 14 Looks durch `renderBranding()` und den Windows-Dateisperren-Helfer, anschließend vollständige Dekodierprüfung. Keine Spielstarts, keine Demo-Umschreibung und keine Uploads.

## Prüfung

- 148 Companion-Tests bestanden, zwei vorhandene Tests übersprungen (150 insgesamt); Version 0.42.0 konsistent. Neue Prüfungen für Kennungen/Graph-Injektion, skalierendes Highlight-Bloom, Auftragserhalt, Filter vor dem Overlay, vollständige Szenen, Originalton und Bildrate. Bridge-Test bestätigt beide Filter-Capabilities.
- Echte vorhandene Companion-Aufnahme, alle 14 Looks mit FFmpeg 7.1 gerendert und visuell verglichen. Vollständiger Export mit nativem C#-5-Dateisperren-Helfer: 1920 × 1080, 60 fps, 18,02 Sekunden inklusive AAC-/Container-Rundung, Ton erhalten, fehlerfrei dekodiert. Keine neue CS2-Aufnahme nötig oder durchgeführt.
- Website: 533 Tests und 35 Tests der alten Companion-Kopie bestanden (Git-bzip2 im Test-PATH), TypeScript und ESLint auf geänderten Dateien ohne Befund.
- Browserprüfung der echten Filter-Komponenten: sechs Bilder geladen, Auswahl und Originalvergleich geprüft, Pro-Looks ohne v2 ausgeblendet, alter Kino-Filter weiter wählbar. 1440 px Desktop und 390 px Mobil, kein Überlauf der Filterauswahl, keine JavaScript-Seitenfehler. Die temporäre Prüfroute wird nicht ausgeliefert. Vollständiger Website-/Bridge-Livebetrieb mit neu installiertem Companion ist nicht getestet.

Halation braucht wegen der zusätzlichen Bildverzweigung mehr Rechenzeit: lokal etwa 13,4 s für 3 s Vorschau gegenüber etwa 3,6 s für Arena Pro, jeweils CPU/x264. Das ist ein Einzelvergleich auf diesem PC, keine allgemeine Leistungszusage. Unterschiedliche Maps und Beleuchtungen ändern die Bildwirkung; keine Kalibrierung für alle Karten behaupten.

Die neue Companion-Version ist lokal für 0.42.0 vorbereitet. Kein Merge, kein öffentliches Release und kein Update einer laufenden Installation durchgeführt. Die Webseite benötigt für die neuen Optionen das passende Companion-Update.


## Ergänzung: kräftige Looks

Neu: **TecMon Ultra** (Violett/Gold intensiv), **Neon Storm** (Cyan/Magenta), **Inferno** (Rot/Bernstein), **Arctic** (Eisblau), **Toxic Lime** (Grün/Gelb), **Blockbuster** (Teal/Orange intensiv), **Crimson Noir** (entsättigtes Dunkelrot) und **Bloom Ultra** (satte Farben und stärkeres Highlight-Bloom). Eigene kräftigere Tonkurve, Farbgewichtung und Sättigung; die vorherigen sechs Filter werden nicht stärker gestellt. Bloom Ultra setzt die Lichtschwelle auf 165/255, den Screen-Anteil auf 30 % und den Radius auf 5 px bei 1080p. Halation behält 190/255, 16 % und 3,2 px.

Der Kinomodus wurde auf Nutzerwunsch entfernt. Alle Farbfilter verwenden den vollständigen Bildausschnitt ohne Kinobalken.

Die 14 Looks sind mit echter Aufnahme und nativem Windows-Export geprüft. Alle acht neuen Testbilder wurden im Browser geladen; die ursprünglichen sechs öffentlichen Vorschaubilder sind bytegleich geblieben. Frühere Testergebnisse oben beziehen sich auf die erste Sechser-Auswahl.

Nach Entfernung des Kinomodus erneut geprüft: Companion 149 Tests bestanden, zwei vorhandene übersprungen (151 insgesamt).

## Szenenfilter-Popup mit Beispielvideo

Die Szenenliste öffnet eine gemeinsame Filterauswahl als natives modales Popup: über „Szenenfilter mit Beispielvideo auswählen“ für alle Szenen oder über den Filterknopf einer einzelnen Szene. Oben läuft ein fünfsekündiger Clip, darunter stehen die verfügbaren Filter. Klicks ändern zunächst nur die Vorschau. „Übernehmen“ setzt den Filter für das gewählte Ziel; „Abbrechen“, Escape und Klick außerhalb verwerfen den Entwurf. Der Fokus kehrt zum auslösenden Knopf zurück.

Alle 50 Filter plus Original haben ein mit der Companion-FFmpeg-Kette gerendertes Video unter `public/video-filters/demo-v1/`. Der Clip animiert ausschließlich das vorhandene öffentliche Website-Testmotiv `card-cs-v2.webp`; er enthält keine private Demo-Aufnahme und ist ausdrücklich als animiertes Testmotiv beschriftet. Audio ist nicht enthalten. Nur das aktuell angezeigte Video wird geladen. Beim Filterwechsel bleiben Zeitpunkt und Pause erhalten; ein Originalvergleich ist möglich. Die v2-Capability bleibt Voraussetzung für die 14 neuen Looks.

Erzeugung im Companion-Repo: `node scripts/generate-filter-preview-videos.mjs <ffmpeg.exe> <Website-Repo>`. Der Generator dekodiert jedes Ergebnis vollständig und schreibt ein Manifest. Browserprüfung der echten Aufnahme-Komponente mit nachgebauter Bridge: Einzel- und Gesamtauswahl, Abbrechen/Escape, Originalvergleich, Zeit-/Pausenerhalt, Fokus-Rückgabe und Tastaturbegrenzung sowie 390-px-Mobilansicht erfolgreich. Keine Aufnahme gestartet und keine echte Companion-Verbindung angesprochen.
