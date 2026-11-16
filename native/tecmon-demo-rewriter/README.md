# TecMon-Demo-Rewriter

Kleines Rust-Programm des TecMon Companion (MIT). Es schreibt eine **Kopie**
einer CS2-Demo, in der gewählte Spieler ein anderes Agentenmodell tragen, und
stellt die Bodygroups der Standard-Handschuhe passend zum Modell ein. Die
Original-Demo bleibt unverändert. Nichts davon läuft im Spiel.

## Aufrufe

```
tecmon-demo-rewriter rewrite <auftrag.json>   # Agenten/Handschuhe umschreiben
tecmon-demo-rewriter learn <demo.dem>         # Bodygroups je Modell aus einer Demo lesen
tecmon-demo-rewriter looks <demo.dem>         # Aussehen je Spieler (Prüfung)
tecmon-demo-rewriter compare <a.dem> <b.dem>  # alle Felder außer Modellfeldern vergleichen
tecmon-demo-rewriter hash <modellpfad>        # Ressourcen-ID eines Modells
```

Auftrag (`agent-swap.mjs` im Companion erzeugt ihn):

```json
{
  "input": "match.tecmon-skins.dem",
  "output": "match.tecmon-agents.dem",
  "learn": "match.dem",
  "looks_cache": "agent-looks.json",
  "players": [{ "steamid": "7656119…", "t": "agents/models/…/….vmdl", "ct": "…" }]
}
```

## So funktioniert es

- `m_hModel` eines Spieler-Pawns ist die Ressourcen-ID des Modells:
  MurmurHash64B des kleingeschriebenen Pfads mit Startwert `0xEDABCDEF`.
- Bodygroups (`m_nBodyGroupChoices`) und `m_MeshGroupMask` legen fest, ob die
  Standard-Handschuhe des Agenten sichtbar sind. Welcher Platz das ist, hängt
  vom Modell ab. Der Rewriter lernt es aus der Original-Demo (wie CS2 selbst es
  gesetzt hat), merkt es sich in `looks_cache` und schätzt nur, wenn ein Modell
  noch nie mit und ohne Handschuhe gesehen wurde (`guessed` in der Antwort).
- Fehlen Felder im Paket, weil sie dem Klassen-Baseline entsprechen, fügt der
  Rewriter sie ein und kodiert dafür die Feldliste des Pawns neu.

## Bibliothek

`vendor/source2-demo` ist [source2-demo](https://github.com/Rupas1k/source2-demo)
0.5.11 von Artem Rupasov (MIT OR Apache-2.0, Lizenztexte im Ordner).
TecMon-Änderungen sind mit „TecMon:“ markiert:

- `stream/field_path/encode.rs`: Kodierer für Feldpfad-Listen
- `stream/field_path/codec.rs`: Huffman-Code einer Feldpfad-Operation schreiben
- `parser/demo/writer/*`: `DemoRewriter::extra_entity_fields()` und das
  Neukodieren eines Entity-Feldblocks

Kein Code aus CS2-nskinz.

## Prüfen

```
cargo test --release
(cd vendor/source2-demo && cargo test --lib --no-default-features --features cs2)
tecmon-demo-rewriter compare original.dem umgeschrieben.dem
```
