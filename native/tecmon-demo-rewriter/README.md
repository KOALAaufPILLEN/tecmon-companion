# TecMon-Demo-Rewriter

Kleines Rust-Programm des TecMon Companion (MIT). Es schreibt in einem
Durchgang eine **Kopie** einer CS2-Demo, in der gewählte Spieler ein anderes
Agentenmodell, andere Waffen-Skins, Messer und Handschuhe tragen, und stellt die
Bodygroups der Handschuhe passend zum Modell ein. Die Original-Demo bleibt
unverändert. Nichts davon läuft im Spiel.

## Aufrufe

```
tecmon-demo-rewriter rewrite <auftrag.json>   # Agenten, Skins, Messer, Handschuhe umschreiben
tecmon-demo-rewriter learn <demo.dem>         # Bodygroups je Modell aus einer Demo lesen
tecmon-demo-rewriter looks <demo.dem>         # Aussehen je Spieler (Prüfung)
tecmon-demo-rewriter compare <a.dem> <b.dem>  # alle Felder außer Modellfeldern vergleichen
tecmon-demo-rewriter events <demo.dem>        # Ereignisse mit Waffenangaben (Killfeed, Prüfung)
tecmon-demo-rewriter hash <modellpfad>        # Ressourcen-ID eines Modells
tecmon-demo-rewriter econ <demo.dem> <id64>   # Skin-Felder der Waffen und Handschuhe eines Spielers (Prüfung)
tecmon-demo-rewriter stickers <demo.dem>      # Sticker je Waffe (Prüfung)
```

Auftrag (`agent-swap.mjs` im Companion erzeugt ihn):

```json
{
  "input": "match.dem",
  "output": "match.tecmon-swap.dem",
  "learn": "match.dem",
  "looks_cache": "agent-looks.json",
  "players": [{
    "steamid": "7656119…",
    "t": "agents/models/…/….vmdl",
    "clear_stickers": [7],
    "skins": [
      { "kind": "weapon", "def": 7, "paint_kit": 180, "seed": 3, "wear": 0.15, "legacy": 0 },
      { "kind": "knife", "def": 507, "side": "t", "paint_kit": 38, "seed": 1, "wear": 0.01 },
      { "kind": "glove", "def": 5030, "side": "ct", "paint_kit": 10037, "seed": 1, "wear": 0.1 }
    ]
  }]
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
- Skins (`src/skins.rs`): Für Waffen des Spielers (`m_OriginalOwnerXuid…`)
  setzt der Rewriter die Attribute 6 (Paintkit), 7 (Muster) und 8 (Abnutzung)
  in `m_NetworkedDynamicAttributes`, die Fallback-Werte, eine eigene markierte
  Item-ID (oberstes Byte `0x7E`; nie `0xF…`, das liest CS2 als Faux-ID mit
  Definition und Paintkit und stürzt bei Unsinn-Werten ab), Qualität und das Namensschild
  „www.TecMon.Online“. `legacy` stellt `m_MeshGroupMask` auf das alte (2) oder neue
  (1) Waffenmodell.
- Messer: Item-Definition und `m_nSubclassID` (String-Token der Definition)
  bestimmen das Modell auf Clientseite. `m_hModel` wird nicht direkt ersetzt,
  damit beim Demo-Sprung keine fremden Skelett-/Animationsdaten am neuen Modell
  anliegen. Die Seite
  kommt vom Träger, sonst vom Team des Besitzers.
- Killfeed: Bei Messer-Kills mit getauschtem Messer bekommt das Ereignis
  `player_death` den Namen des neuen Messers (`KILLFEED`), dessen Item-ID und
  Faux-ID; alle anderen Ereignisse bleiben, wie sie sind.
- Handschuhe: `m_EconGloves` des Pawns je Seite, dazu `m_nEconGlovesChanged`.
  Auf der Seite ohne Wunsch merkt sich der Rewriter die echten Handschuhe und
  stellt sie nach einem Seitenwechsel wieder her.
- Sticker der getauschten Waffen (`clear_stickers`): nur die Sticker-IDs
  (Attribute 113, 117, …) werden 0.
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

Eigene Umsetzung; kein Code aus anderen Skin-Tauschern. Die Feldnamen und
Werte stammen aus dem Netzwerk-Schema von CS2 und aus echten Demos.

## Prüfen

```
cargo test --release
(cd vendor/source2-demo && cargo test --lib --no-default-features --features cs2)
tecmon-demo-rewriter compare original.dem umgeschrieben.dem
```
