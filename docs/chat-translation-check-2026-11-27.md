# Chat-Übersetzung: Prüfung am 27. November 2026

Stand: lokale Änderung für Companion 0.53.1, nicht gemergt oder installiert.

## Verfahren

Windows, Bergamot 0.4.9 aus dem bestehenden Cache, dieselben fest hinterlegten
Mozilla-/Bergamot-Modelle wie im Companion. Dateien über `ensureEngine()` und
`ensureModel()` geprüft. Netzabrufe im Prüflauf absichtlich abgelehnt.
Nur erfundene Testnachrichten, keine gelesenen Spielerchats. Kein Spielstart,
keine Installation und keine Änderung einer CS2-Konfiguration.

Die komplette Nachricht wird weiter gemeinsam übersetzt. Die neue Vorbereitung
korrigiert gedehnte Schreibweisen und einige eindeutige englische Chatwendungen
in der Quellsprache. Sie übersetzt keine Wörter einzeln. Das Modell bleibt für
Satzbau und Zielsprache zuständig. Originaltext und Absender bleiben unverändert.

## Gedehnte Wörter: echte Ausgaben nach Deutsch

| Eingabe | Vorher | Mit Vorbereitung |
| --- | --- | --- |
| heeeelp | unverändert | Hilfe |
| noooo | unverändert | Nein |
| goooood | unverändert | Gut |
| pleeease help me | unverändert | Bitte helfen Sie mir |
| merhabaaaa | helloaaaa | Hi |
| lütfeeeen | unverändert | Bitte |
| даааавай | Daaaawaai | Komm schon. |
| спасииибо | der Saviyiio | Danke. |

Zusätzlich vollständiger Importweg mit fünf Nachrichten geprüft (Englisch,
Türkisch, Russisch nach Deutsch), einschließlich `heeeelp :D` → `Hilfe :D`.
Alle fünf wurden übersetzt, Originaltexte und Smileys blieben erhalten.

## Ganze Sätze: echte Ausgaben nach Deutsch

| Eingabe | Mit Vorbereitung |
| --- | --- |
| Please wait for me, I need to reload. | Bitte warten Sie auf mich, ich muss nachladen. |
| Can you hold B while I watch mid? | Kannst du B halten, während ich in der Mitte schaue? |
| I was flashed, I couldn't see anything. | Ich wurde von einer Blitzgranate geblendet, ich konnte nichts sehen. |
| Don't push alone, wait for the team. | Nicht allein angreifen, auf das Team warten. |
| Pleeease wait for me, I need to reload. | Bitte warten Sie auf mich, ich muss nachladen. |
| My bad, I thought you were covering me. | Es war mein Fehler, ich dachte, du beschützst mich. |
| Let's save our weapons for the next round. | Lassen Sie uns unsere Waffen für die nächste Runde behalten. |

Vorher übersetzte die Engine unter anderem „Drängen Sie nicht alleine“ und
„Meine schlechte, ich dachte, du bedecke mich.“ Die engen Umschreibungen helfen
bei diesen Fällen, ohne einen anderen Übersetzungsdienst einzubauen.

## Grenzen

- `helloooo` wird zwar als `Hello` vorbereitet, aber das Modell lässt `Hello`
  unverändert. Der Companion meldet dafür korrekt keine erfolgreiche Übersetzung.
- `He is low on health, one more hit should finish him.` bleibt im echten Test
  schlecht: „Er ist gesundheitlich anhalten, ein weiterer Treffer sollte ihn beenden.“
  Nicht durch willkürlichen Ersatz kaschiert. Das Modell versteht nicht jeden Gaming-Satz.
- Höflichkeitsform und Stil wechseln weiterhin je nach Modell. Nicht alle Sprachen
  wurden mit echten Modellen neu geprüft. Echte Läufe hier: en/de, tr/en/de, ru/en/de.
- Unbekannte gedehnte Vokale werden höchstens auf zwei Zeichen gekürzt; daraus
  folgt keine Garantie, dass jedes unbekannte Wort richtig erkannt wird.
- Keine Nachrichten über mehrere Spieler oder Zeitpunkte zusammengefasst. Jede Nachricht
  besitzt ihren eigenen Kontext. Ein größeres Kontextmodell wäre eine separate Änderung
  mit eigener Prüfung von Speicherverbrauch, Laufzeit, Lizenz und Datenschutz.

## Automatische Regression

22 Übersetzer-Tests: bestehende Spracherkennung, Worker-Limits/Neustart, Dateien und
Konfigurationsbereinigung; zusätzlich Unicode und gedehnte Wörter, echte Doppelbuchstaben,
mehrdeutige Wörter, Links/Handles, Originaltext, Satzvorbereitung und Gegenbeispiele
(`push the button`, `save me`, Verneinungen und Zitate).
Der Test des vollständigen Importwegs zählt die Modellaufrufe: eine Nachricht mit
zwei Sätzen wird als ein Text übergeben, nicht Wort für Wort oder Satz für Satz.
