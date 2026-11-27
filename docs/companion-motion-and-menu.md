# Figur und Menü, 26. November 2026

## Ein Menü überall (0.53.0, 27. November 2026)

Sechs Bereiche statt sieben: Start (Verbindung, Auftrag, Updates & Werkzeuge), Spiele (Spielauswahl;
CS2: Rundentipps, Stats nach dem Spielen, Quiz; Dota-2-Tipps; Scoreboard-Foto; Spiel-Pakete; Erweitert:
Configs), Videos (Highlight-Video, Clip-Puffer, Letzte Videos; Erweitert: Skins & Agenten, Aufnahme-Setup,
Aufträge, Demos herunterladen), Overlays (Fadenkreuz, Chat-Übersetzer und Chat-Overlay), TecMon (Level und
Persönlichkeit, Minispiele), Einstellungen (Figur, Ansicht, Autostart). Das Schnellmenü zeigt dieselben
Bereiche; das Tray-Symbol öffnet es ebenfalls. Begründung und klickbares Vorher/Nachher:
[companion-menu-konzept-0.53.html](companion-menu-konzept-0.53.html). Die Sprechblase hebt sich über Menüs,
wenn kein freier Platz bleibt (`TipBubble.Raise()`, ohne Aktivierung).

Die Abschnitte unten beschreiben den Stand 0.52.0 und bleiben zur Nachvollziehbarkeit stehen.

## Implementierter Menüstand 0.52.0

Der Aufbau ist jetzt in `tools/cs2-companion/public/menu.js` mit den echten
Companion-Karten verbunden, nicht nur in der unten beschriebenen Vorschau.
Das Linksklick-Fenster bietet sieben Bereiche und die Spielauswahl einschließlich
Paketverwaltung; weitere/geplante Pakete bleiben erreichbar. Bestehende DOM-Knoten
werden verschoben, damit IDs, Eingabewerte, Bestätigungen und Listener erhalten
bleiben. Direkte Sprünge und Hashlinks öffnen Seite, Spiel und Unterkarte.

↔ im nativen Fensterkopf wechselt von 520×640 zu höchstens 980×760 und zurück;
beide Größen bleiben innerhalb des aktuellen Monitor-Arbeitsbereichs. Unter
680 px Breite wird die Seitennavigation zur umgebrochenen oberen Navigation.
Kein Fokuswechsel während eines Spiels ohne Nutzeraktion. Die Sprechblase bleibt
eine getrennte, nicht aktivierende Fläche mit bestehender Kollisionsvermeidung.

Prüfung: echte lokale Companion-Seite mit isoliertem Testprofil, sieben Bereiche,
Spielauswahl und Original-Demo-Eingaben im Browser geprüft. Drei DOM-Regressionen
sichern vollständige Kontrollelemente/Listener, Spiel-Paketfilter und Sprünge mit
erhaltenen Entwürfen. Nativer C#-5-Test prüft den Größenwechsel und Monitorgrenzen.
Keine Installation auf dem Nutzerprofil und kein echter Download zum Menütest.

Vorbereitet für 0.51.0. Quellcode/PR, noch kein Nachweis eines veröffentlichten oder
installierten Updates. Der große Menüumbau ist ein interaktiver Entwurf; die
bestehende Oberfläche behält alle Funktionen und bekommt die unten genannten Korrekturen.

## Verhalten und Darstellung

- `desktop.motion`: `still`, `chill` (Standard), `hyper`. Ersetzt den Flugschalter.
  Alte `wander: false` werden Stillstand; `true` wird Chillig. Für alte Clients
  bleibt `wander` als abgeleitetes Feld erhalten. Expliziter Modus hat Vorrang.
- Stillstand hält Position und Schwebeanimation an. Blinzeln/Sprechen und
  ausdrücklich gewählte Interaktionen bleiben möglich. Chillig fliegt mit 20 px/s,
  Hyperaktiv mit 100 px/s an den vier Rändern des eigenen Monitor-Arbeitsbereichs.
  Kein diagonaler Weg durch die Spielmitte. Nach manuellem Verschieben wird mit
  maximal 620 px/s zum nächsten Rand angedockt. Negative Monitor-Koordinaten erlaubt.
- Neue automatische Tricks: einfache/doppelte Drehung, federnder Seitenschwenk,
  Nicken mit 3D-Neigung. Chillig: alle 65–120 s, Hyperaktiv: alle 12–26 s.
  Keine Tricks während Spiel, Aufnahme, Dialog, Sprechblase oder Schlaf.
  Chillig ruht nach drei Minuten ohne Interaktion, Hyperaktiv bleibt wach bis
  zum expliziten Schlaf. Bewegung und Effekte beachten den Animationsschalter.
- Metallmaterial im vorhandenen Software-Renderer: Metallanteil mindestens 0,82,
  Rauheit 0,24–0,42, geringeres diffuses Licht und gerichtete Studioreflexe.
  Geometrie, Originaltextur, goldene/lila Teile und LED-Ausdrücke erhalten.
  Alle 96 Bilder für die sparsame Variante mit demselben Renderer neu erzeugt.
  Der 2D-Rückfall bleibt für fehlende Ressourcen erhalten.

## Vorübergehend sparsam beim Spielen

`desktop.gameEconomy` (Standard an, abschaltbar) verwendet im Spiel die
vorgerenderten Metall-Ansichten und 20 statt etwa 60 Animationstakte/s. Die
gespeicherte bevorzugte `quality` wird nicht überschrieben. Nach Spielende gilt
wieder die bevorzugte Darstellung. Keine zusätzliche Bridge-Capability.

Erkennung nur über Namen/PID des Vordergrundprozesses und dessen Weiterbestehen:
CS2, Dota 2, Deadlock/Citadel, Wardogs, Valorant, Apex, Fortnite, League of Legends.
Kein Speicherzugriff, Hook, Injektion oder Eingaben ans Spiel. Alt-Tab beendet die
Sitzung nicht und startet keine neue Verwandlung. Andere Spiele sind damit nicht
automatisch als erkannt zugesichert.

Einmal je erkanntem Spielstart: kurzer Dreh-/Funken-Effekt und
„TecMon entwickelt sich zuuuuu …“, 2,4 s später einer von drei Sprüchen über den
kleineren Ressourcenhunger. Während `quiet`, Aufnahme oder offenem Menü warten
Spruch und Effekt. Ohne verlässliche GSI-Phaseninformation wird im Vordergrundspiel
nicht gesprochen; die Erklärung wartet bis zum Wechsel aus dem Spiel.
Keine gemessene FPS-Steigerung zugesichert.

## Sichtbare Sprechblasen und ruhige Einstellungen

Die Blase berechnet ihre Position neu, wenn Figur oder Fenster sich ändern.
Kandidaten neben der Figur und ober-/unter-/seitlich von Einstellungen/Schnellmenü
werden nach Überschneidung und Entfernung bewertet. Bildschirmbegrenzung und
`WS_EX_NOACTIVATE` bleiben erhalten. Wenn auf einem kleinen Monitor kein freies
Rechteck groß genug ist, wird die Überschneidung minimiert statt vollständige
Überdeckungsfreiheit zu behaupten. Während einer sichtbaren Blase pausiert der Flug.

Desktop-Kategorien und Unterkarten starten geschlossen; explizite Sprünge/Hashlinks
öffnen den gewünschten Bereich. Der Fadenkreuz-Editor ist ebenfalls anfangs
geschlossen. Darstellungswahl auch in „Einfach“ erreichbar. Das kürzere native
Schnellmenü bietet Witz, Trick, Bewegungsmodus und Sparmodus direkt. Alle bisherigen
Funktionen bleiben im vollständigen Menü bzw. Companion-Fenster erreichbar.

## Menüentwurf und Vollständigkeit

[Klickbarer Entwurf](companion-menu-mockup.html), [Funktionsinventar](companion-menu-inventory.json).
Der HTML-Entwurf ist ein Visualize-Fragment; seine zwei Varianten nutzen den
Visualize-Host für die Variantenwahl. Die erste Variante funktioniert auch beim
direkten Öffnen. Keine echten Einstellungen, Dateien, Downloads oder API-Aufrufe.

Sieben Bereiche: TecMon; Spiele & Tipps; Aufnahmen; Demos & Stats; Overlays & Chat;
Clips & Galerie; System. Figur/Sprechblase bekommen eine eigene Vorschaufläche.
Unterpunkte werden bewusst geöffnet, immer nur einer. Die Alternative verwendet
Themenreiter statt einer Seitennavigation.
Aktive Navigation und Spiel-/Modusknöpfe übernehmen die Darstellung aus
`TecMonMenu.OnRenderMenuItemBackground` im nativen Figurenmenü: dunkler Verlauf
von RGB(27,22,38) nach RGB(11,10,17), lila Auswahl RGB(167,139,250) mit Alpha 60/255,
goldene Kontur RGB(232,197,115) mit Alpha 200/255, helle Schrift und linke Goldmarke.
Nur oben links und unten rechts sind 6 px abgeschnitten. Keine goldgefüllten Reiter.
Offene Unterpunkte haben einen lila/goldenen Kopf; inaktive Menüpunkte bleiben ruhig.

„Spiele & Tipps“ beginnt mit der Spielauswahl: Counter-Strike 2 (Rundentipps,
alle Tipparten, Quiz), Dota 2 (Tipps und Tipparten), Wardogs (Scoreboard-Foto).
Installation/Entfernen steht jeweils beim ausgewählten Spiel. Die Auswahl bleibt
im Entwurf erhalten. Spielübergreifende Funktionen bleiben in ihren Hauptbereichen.

Aufruf und Platzierung: Linksklick auf die Figur bzw. das Tray-Symbol öffnet die
Einstellungen, Rechtsklick auf die Figur den Schnellzugriff; Esc schließt das
Einstellungsfenster. Das native Fenster öffnet bereits neben der Figur und wird
auf den Monitor begrenzt. Für den neuen Aufbau ist die kompakte Ansicht dort
vorgesehen, das große Cockpit als ausdrücklich geöffnete Erweiterung. Während
das Menü offen ist, pausiert der Flug. Sprechblasen berücksichtigen das Fenster
als Hindernis; bei kleinem Monitor ist vollständige Trennung nicht garantiert.

107 statische Bedienelemente aus der bestehenden Seite wurden erfasst, ergänzt
um dynamische Kataloge/Windows-Aktionen. Das Inventar enthält 27 Funktionsgruppen
und 182 Optionen/Katalogeinträge (keine Behauptung von 182 eigenständigen Features).
Enthalten sind insbesondere alle 16 CS2- und fünf Dota-Tipparten, CFG-Katalog mit
Tastenwahl, Fadenkreuzstile/Vorlagen, Persönlichkeit einschließlich HUAN-Hinweis,
Minispiele, Video/Skins, Demos/Stats, Chat, Clips, Spiel-Pakete, Verbindungen und Updates.

## Prüfung und Reproduktion

- Node-Tests einschließlich Migration/Persistenz und unveränderter bevorzugter Qualität.
- Nativer C#-5-Build; `DesktopMotionSelfTest` prüft 30.000 Randpositionen,
  negative Monitore, Ecken und freie Blasenposition bei zwei offenen Menüs.
- Metall-Render-Vorschau und erzeugtes Schnellmenü geprüft. Auf diesem PC etwa
  9,9 ms pro hochwertigem Modellbild; nicht als allgemeines Leistungsversprechen.
- Noch kein echter automatischer CS2-Spielstart mit dieser Version und kein
  verteiltes Installer-Update geprüft. Kein neues VAC-/FACEIT-Zertifikat behauptet.

Sparsame Ansichten reproduzieren: nativen Launcher mit Ressource `TecMonModel`
kompilieren, danach `TecMon-Motion-Preview.exe --desktop-export-sheet <ziel.png>`.
Ausgabe: 8 Spalten, 96 Ansichten/Ausdrücke, 200×130 px je Zelle. Die neue Datei ist
`public/desktop-bot-3d.png`; `scripts/figure-3d/index.html` dokumentiert die
entsprechende Materialanpassung der GLB-Vorschau.
