//! Skin-Tausch: Waffen-Skins, Messer und Handschuhe in einer Kopie der Demo.
//!
//! Eigener Code des TecMon Companion (MIT). Gesetzt werden nur die Felder, die
//! CS2 selbst für Skins ins Netz schickt: Item-Definition, Qualität, Item-ID,
//! Namensschild, die Attribute „Paintkit“ (6), „Muster“ (7) und „Abnutzung“ (8)
//! sowie die Fallback-Werte. Messer bekommen dazu Modell und Unterklasse.

use crate::{prop, resource_id, string_token, weapon_owner, ATTRIBUTE_PREFIX};
use anyhow::{bail, Result};
use source2_demo::prelude::*;
use std::collections::HashMap;

/// Namensschild auf getauschten Teilen: Im Video ist sichtbar, dass der Skin nicht echt ist.
pub const SKIN_TAG: &str = "TecMon Skin";
const GLOVE_PREFIX: &str = "m_EconGloves.m_NetworkedDynamicAttributes.m_Attributes";
const ATTR_PAINT: u64 = 6;
const ATTR_SEED: u64 = 7;
const ATTR_WEAR: u64 = 8;
const MAX_ATTRIBUTES: usize = 64;
pub const MAX_SKINS: usize = 48;

/// Waffen, deren Skin sich tauschen lässt (Item-Definitionen aus CS2).
const WEAPONS: [u32; 35] = [
    1, 2, 3, 4, 7, 8, 9, 10, 11, 13, 14, 16, 17, 19, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 38, 39, 40,
    60, 61, 63, 64,
];

/// Messer: Item-Definition -> Modell (aus items_game.txt von CS2).
const KNIVES: [(u32, &str); 22] = [
    (42, "weapons/models/knife/knife_default_ct/weapon_knife_default_ct.vmdl"),
    (59, "weapons/models/knife/knife_default_t/weapon_knife_default_t.vmdl"),
    (500, "weapons/models/knife/knife_bayonet/weapon_knife_bayonet.vmdl"),
    (503, "weapons/models/knife/knife_css/weapon_knife_css.vmdl"),
    (505, "weapons/models/knife/knife_flip/weapon_knife_flip.vmdl"),
    (506, "weapons/models/knife/knife_gut/weapon_knife_gut.vmdl"),
    (507, "weapons/models/knife/knife_karambit/weapon_knife_karambit.vmdl"),
    (508, "weapons/models/knife/knife_m9/weapon_knife_m9.vmdl"),
    (509, "weapons/models/knife/knife_tactical/weapon_knife_tactical.vmdl"),
    (512, "weapons/models/knife/knife_falchion/weapon_knife_falchion.vmdl"),
    (514, "weapons/models/knife/knife_bowie/weapon_knife_bowie.vmdl"),
    (515, "weapons/models/knife/knife_butterfly/weapon_knife_butterfly.vmdl"),
    (516, "weapons/models/knife/knife_push/weapon_knife_push.vmdl"),
    (517, "weapons/models/knife/knife_cord/weapon_knife_cord.vmdl"),
    (518, "weapons/models/knife/knife_canis/weapon_knife_canis.vmdl"),
    (519, "weapons/models/knife/knife_ursus/weapon_knife_ursus.vmdl"),
    (520, "weapons/models/knife/knife_navaja/weapon_knife_navaja.vmdl"),
    (521, "weapons/models/knife/knife_outdoor/weapon_knife_outdoor.vmdl"),
    (522, "weapons/models/knife/knife_stiletto/weapon_knife_stiletto.vmdl"),
    (523, "weapons/models/knife/knife_talon/weapon_knife_talon.vmdl"),
    (525, "weapons/models/knife/knife_skeleton/weapon_knife_skeleton.vmdl"),
    (526, "weapons/models/knife/knife_kukri/weapon_knife_kukri.vmdl"),
];

/// Messer: Item-Definition -> Waffenname im Ereignis `player_death` (Killfeed-Symbol).
const KILLFEED: [(u32, &str); 22] = [
    (42, "knife"),
    (59, "knife_t"),
    (500, "bayonet"),
    (503, "knife_css"),
    (505, "knife_flip"),
    (506, "knife_gut"),
    (507, "knife_karambit"),
    (508, "knife_m9_bayonet"),
    (509, "knife_tactical"),
    (512, "knife_falchion"),
    (514, "knife_survival_bowie"),
    (515, "knife_butterfly"),
    (516, "knife_push"),
    (517, "knife_cord"),
    (518, "knife_canis"),
    (519, "knife_ursus"),
    (520, "knife_gypsy_jackknife"),
    (521, "knife_outdoor"),
    (522, "knife_stiletto"),
    (523, "knife_widowmaker"),
    (525, "knife_skeleton"),
    (526, "knife_kukri"),
];

const GLOVES: [u32; 8] = [4725, 5027, 5030, 5031, 5032, 5033, 5034, 5035];

/// Messer mit Standard-Seite (59 = T, 42 = CT).
fn default_side(def: u64) -> Option<usize> {
    match def {
        59 => Some(0),
        42 => Some(1),
        _ => None,
    }
}

pub fn knife_model(def: u32) -> Option<&'static str> {
    KNIVES.iter().find(|(d, _)| *d == def).map(|(_, m)| *m)
}

pub fn is_knife(def: u64) -> bool {
    KNIVES.iter().any(|(d, _)| *d as u64 == def)
}

/// Waffenname eines Messers im Killfeed.
pub fn killfeed_name(def: u32) -> Option<&'static str> {
    KILLFEED.iter().find(|(d, _)| *d == def).map(|(_, n)| *n)
}

/// Ist der Waffenname im Ereignis ein Messer (Standard oder Econ)?
pub fn is_knife_kill(weapon: &str) -> bool {
    KILLFEED.iter().any(|(_, n)| *n == weapon)
}

/// „Faux“-Item-ID wie CS2 sie in `player_death` schickt: Markierung, Paintkit, Definition.
pub fn faux_item_id(p: &Paint) -> u64 {
    0xF000_0000_0000_0000 | ((p.paint as u64 & 0xFFFF) << 16) | (p.def as u64 & 0xFFFF)
}

/// Ein Skin-Wunsch, fertig geprüft.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Paint {
    pub def: u32,
    pub paint: u32,
    pub seed: u32,
    pub wear: f32,
    pub legacy: Option<u8>,
    pub item_id: u64,
}

/// Skins eines Spielers. Seiten-Index 0 = T, 1 = CT.
#[derive(Default, Clone)]
pub struct PlayerSkins {
    pub weapons: HashMap<u64, Paint>,
    pub knife: [Option<Paint>; 2],
    pub glove: [Option<Paint>; 2],
}

/// FNV-1a: feste, nachvollziehbare Item-ID je Spieler und Skin.
fn item_id(steamid: &str, kind: &str, p: &Paint) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    let text = format!("{steamid}|{kind}|{}|{}|{}|{}", p.def, p.paint, p.seed, p.wear.to_bits());
    for b in text.bytes() {
        h ^= b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    // Hohe Bits gesetzt: kollidiert nicht mit echten Inventar-IDs.
    h | 0xF000_0000_0000_0000
}

fn sides(side: &Option<String>) -> Result<Vec<usize>> {
    Ok(match side.as_deref() {
        None => vec![0, 1],
        Some("t") => vec![0],
        Some("ct") => vec![1],
        Some(_) => bail!("ungültige Seite"),
    })
}

/// Skin-Wünsche eines Spielers prüfen: nur bekannte Waffen, Messer und Handschuhe, Zahlen in Grenzen.
pub fn player_skins(steamid: &str, list: &[crate::SkinRequest]) -> Result<PlayerSkins> {
    if list.len() > MAX_SKINS {
        bail!("zu viele Skins");
    }
    let mut out = PlayerSkins::default();
    for s in list {
        if !s.wear.is_finite() || !(0.0..=1.0).contains(&s.wear) || s.seed > 1000 || s.paint_kit > 100_000 {
            bail!("ungültiger Skin");
        }
        let mut paint = Paint {
            def: s.def,
            paint: s.paint_kit,
            seed: s.seed,
            // CS2 zeigt Abnutzung 0 nicht sauber; kleinster Wert wie im Spiel.
            wear: s.wear.max(0.000_001),
            legacy: None,
            item_id: 0,
        };
        match s.kind.as_str() {
            "weapon" => {
                if !WEAPONS.contains(&s.def) || s.paint_kit == 0 || s.side.is_some() {
                    bail!("ungültige Waffe");
                }
                if let Some(l) = s.legacy {
                    if l > 1 {
                        bail!("ungültiges Waffenmodell");
                    }
                    paint.legacy = Some(l);
                }
                paint.item_id = item_id(steamid, "weapon", &paint);
                out.weapons.insert(s.def as u64, paint);
            }
            "knife" => {
                if knife_model(s.def).is_none() || s.legacy.is_some() {
                    bail!("ungültiges Messer");
                }
                paint.item_id = item_id(steamid, "knife", &paint);
                for side in sides(&s.side)? {
                    out.knife[side] = Some(paint);
                }
            }
            "glove" => {
                if !GLOVES.contains(&s.def) || s.paint_kit == 0 || s.legacy.is_some() {
                    bail!("ungültige Handschuhe");
                }
                paint.item_id = item_id(steamid, "glove", &paint);
                for side in sides(&s.side)? {
                    out.glove[side] = Some(paint);
                }
            }
            _ => bail!("unbekannte Skin-Art"),
        }
    }
    Ok(out)
}

/// Attribute 6, 7 und 8 im Attribut-Array `prefix` setzen; fehlende hinten anhängen.
fn paint_attributes(entity: &Entity, prefix: &str, paint: &Paint, out: &mut Vec<(String, FieldValue)>) {
    let count = (prop(entity, prefix).unwrap_or(0) as usize).min(MAX_ATTRIBUTES);
    let wanted = [(ATTR_PAINT, paint.paint as f32), (ATTR_SEED, paint.seed as f32), (ATTR_WEAR, paint.wear)];
    let mut next = count;
    for (attribute, value) in wanted {
        let slot = (0..count)
            .find(|slot| prop(entity, &format!("{prefix}.{slot:04}.m_iAttributeDefinitionIndex")) == Some(attribute));
        let slot = match slot {
            Some(slot) => slot,
            None => {
                // Vanilla-Messer (Paintkit 0) braucht keine neuen Attribute.
                if paint.paint == 0 {
                    continue;
                }
                let slot = next;
                next += 1;
                let base = format!("{prefix}.{slot:04}");
                out.push((format!("{base}.m_iAttributeDefinitionIndex"), FieldValue::Unsigned16(attribute as u16)));
                out.push((format!("{base}.m_nRefundableCurrency"), FieldValue::Signed32(0)));
                out.push((format!("{base}.m_bSetBonus"), FieldValue::Boolean(false)));
                slot
            }
        };
        let base = format!("{prefix}.{slot:04}");
        out.push((format!("{base}.m_iRawValue32"), FieldValue::Float(value)));
        out.push((format!("{base}.m_flInitialValue"), FieldValue::Float(value)));
    }
    if next != count && next <= MAX_ATTRIBUTES {
        out.push((prefix.to_string(), FieldValue::Unsigned32(next as u32)));
    }
}

fn item_fields(prefix: &str, paint: &Paint, quality: i32, out: &mut Vec<(String, FieldValue)>) {
    out.push((format!("{prefix}.m_iEntityQuality"), FieldValue::Signed32(quality)));
    out.push((format!("{prefix}.m_iItemIDHigh"), FieldValue::Unsigned32((paint.item_id >> 32) as u32)));
    out.push((format!("{prefix}.m_iItemIDLow"), FieldValue::Unsigned32(paint.item_id as u32)));
    out.push((format!("{prefix}.m_szCustomName"), FieldValue::String(SKIN_TAG.to_string())));
}

/// Seite (0 = T, 1 = CT) des Spielers, der die Waffe gerade trägt.
fn holder_side(ctx: &Context, entity: &Entity) -> Option<usize> {
    let handle = prop(entity, "m_hOwnerEntity")? as usize;
    let pawn = ctx.entities().get_by_handle(handle).ok()?;
    match prop(pawn, "m_iTeamNum")? {
        2 => Some(0),
        3 => Some(1),
        _ => None,
    }
}

/// Seite eines Spielers über seinen Controller.
fn owner_side(ctx: &Context, steamid: &str) -> Option<usize> {
    let controller = ctx.entities().iter().find(|e| {
        e.class().name() == "CCSPlayerController" && prop(e, "m_steamID").is_some_and(|id| id.to_string() == steamid)
    })?;
    match prop(controller, "m_iTeamNum")? {
        2 => Some(0),
        3 => Some(1),
        _ => None,
    }
}

/// Gewünschte Felder einer Waffe oder eines Messers mit getauschtem Skin.
pub fn weapon_fields(
    skins: &HashMap<String, PlayerSkins>,
    ctx: &Context,
    entity: &Entity,
    out: &mut Vec<(String, FieldValue)>,
) -> bool {
    if skins.is_empty() {
        return false;
    }
    let Some(def) = prop(entity, "m_AttributeManager.m_Item.m_iItemDefinitionIndex") else {
        return false;
    };
    let Some(owner) = weapon_owner(entity) else {
        return false;
    };
    let Some(player) = skins.get(&owner) else {
        return false;
    };
    if is_knife(def) {
        // Seite: Träger der Waffe, sonst Team des Besitzers (frisch erzeugtes Messer), sonst Standard-Messer.
        let side = holder_side(ctx, entity).or_else(|| owner_side(ctx, &owner)).or_else(|| default_side(def));
        let paint = match side {
            Some(side) => player.knife[side],
            // Seite unbekannt: nur tauschen, wenn beide Seiten dasselbe Messer haben.
            None => player.knife[0].filter(|p| player.knife[1] == Some(*p)),
        };
        let Some(paint) = paint else {
            return false;
        };
        let model = knife_model(paint.def).unwrap_or_default();
        out.push(("m_AttributeManager.m_Item.m_iItemDefinitionIndex".into(), FieldValue::Unsigned16(paint.def as u16)));
        out.push(("m_nSubclassID".into(), FieldValue::Unsigned32(string_token(&paint.def.to_string()))));
        out.push((
            "CBodyComponent.m_skeletonInstance.m_modelState.m_hModel".into(),
            FieldValue::Unsigned64(resource_id(model)),
        ));
        item_fields("m_AttributeManager.m_Item", &paint, if paint.def == 42 || paint.def == 59 { 0 } else { 3 }, out);
        paint_attributes(entity, ATTRIBUTE_PREFIX, &paint, out);
        fallback_fields(&paint, out);
        return true;
    }
    let Some(paint) = player.weapons.get(&def) else {
        return false;
    };
    item_fields("m_AttributeManager.m_Item", paint, 0, out);
    paint_attributes(entity, ATTRIBUTE_PREFIX, paint, out);
    fallback_fields(paint, out);
    if let Some(legacy) = paint.legacy {
        out.push((
            "CBodyComponent.m_skeletonInstance.m_modelState.m_MeshGroupMask".into(),
            FieldValue::Unsigned64(if legacy == 1 { 2 } else { 1 }),
        ));
    }
    true
}

fn fallback_fields(paint: &Paint, out: &mut Vec<(String, FieldValue)>) {
    out.push(("m_nFallbackPaintKit".into(), FieldValue::Signed32(paint.paint as i32)));
    out.push(("m_nFallbackSeed".into(), FieldValue::Signed32(paint.seed as i32)));
    out.push(("m_flFallbackWear".into(), FieldValue::Float(paint.wear)));
}

const GLOVE_FIELDS: [&str; 8] = [
    "m_EconGloves.m_iItemDefinitionIndex",
    "m_EconGloves.m_bInitialized",
    "m_EconGloves.m_iEntityLevel",
    "m_EconGloves.m_iEntityQuality",
    "m_EconGloves.m_iItemIDHigh",
    "m_EconGloves.m_iItemIDLow",
    "m_EconGloves.m_szCustomName",
    "m_nEconGlovesChanged",
];

/// Trägt der Pawn gerade TecMon-Handschuhe (markierte Item-ID)?
fn tecmon_gloves(entity: &Entity) -> bool {
    prop(entity, "m_EconGloves.m_iItemIDHigh").is_some_and(|high| high >> 28 == 0xF)
}

/// Echte Handschuhe des Pawns, um sie auf der Seite ohne Wunsch wiederherzustellen.
fn glove_snapshot(entity: &Entity) -> Vec<(String, FieldValue)> {
    let mut out: Vec<(String, FieldValue)> = GLOVE_FIELDS
        .iter()
        .filter_map(|name| entity.get_property(name).ok().map(|v| (name.to_string(), v.clone())))
        .collect();
    let count = (prop(entity, GLOVE_PREFIX).unwrap_or(0) as usize).min(MAX_ATTRIBUTES);
    out.push((GLOVE_PREFIX.to_string(), FieldValue::Unsigned32(count as u32)));
    for slot in 0..count {
        for field in ["m_iAttributeDefinitionIndex", "m_iRawValue32", "m_flInitialValue", "m_nRefundableCurrency", "m_bSetBonus"] {
            let name = format!("{GLOVE_PREFIX}.{slot:04}.{field}");
            if let Ok(value) = entity.get_property(&name) {
                out.push((name, value.clone()));
            }
        }
    }
    out
}

/// Standard-Handschuhe (keine Econ-Handschuhe), falls die echten unbekannt sind.
fn plain_gloves() -> Vec<(String, FieldValue)> {
    vec![
        ("m_EconGloves.m_iItemDefinitionIndex".into(), FieldValue::Unsigned16(0)),
        ("m_EconGloves.m_bInitialized".into(), FieldValue::Boolean(false)),
        ("m_EconGloves.m_iEntityLevel".into(), FieldValue::Unsigned32(0)),
        ("m_EconGloves.m_iEntityQuality".into(), FieldValue::Signed32(-1)),
        ("m_EconGloves.m_iItemIDHigh".into(), FieldValue::Unsigned32(0)),
        ("m_EconGloves.m_iItemIDLow".into(), FieldValue::Unsigned32(0)),
        ("m_EconGloves.m_szCustomName".into(), FieldValue::String(String::new())),
        (GLOVE_PREFIX.to_string(), FieldValue::Unsigned32(0)),
        ("m_nEconGlovesChanged".into(), FieldValue::Unsigned8(1)),
    ]
}

/// Echte Handschuhe je Spieler und Seite (Team 2/3).
pub type GloveOriginals = HashMap<(String, u64), Vec<(String, FieldValue)>>;

/// Gewünschte Handschuh-Felder eines Pawns (`m_EconGloves`). Gibt zurück, ob der Pawn
/// danach Econ-Handschuhe trägt (`None`, wenn nichts zu tun ist).
pub fn glove_fields(
    player: &PlayerSkins,
    steamid: &str,
    team: u64,
    entity: &Entity,
    originals: &mut GloveOriginals,
    out: &mut Vec<(String, FieldValue)>,
) -> Option<bool> {
    let side = match team {
        2 => 0,
        3 => 1,
        _ => return None,
    };
    if player.glove.iter().all(Option::is_none) {
        return None;
    }
    let Some(paint) = player.glove[side] else {
        // Seite ohne Wunsch: echte Handschuhe merken bzw. nach einem Seitenwechsel zurückholen.
        let key = (steamid.to_string(), team);
        if !tecmon_gloves(entity) {
            originals.insert(key, glove_snapshot(entity));
            return None;
        }
        let restore = originals.get(&key).cloned().unwrap_or_else(plain_gloves);
        let econ = restore
            .iter()
            .any(|(name, value)| name == "m_EconGloves.m_iItemDefinitionIndex" && *value != FieldValue::Unsigned16(0));
        out.extend(restore);
        if !out.iter().any(|(name, _)| name == "m_nEconGlovesChanged") {
            out.push(("m_nEconGlovesChanged".into(), FieldValue::Unsigned8(1)));
        }
        return Some(econ);
    };
    out.push(("m_EconGloves.m_iItemDefinitionIndex".into(), FieldValue::Unsigned16(paint.def as u16)));
    out.push(("m_EconGloves.m_bInitialized".into(), FieldValue::Boolean(true)));
    out.push(("m_EconGloves.m_iEntityLevel".into(), FieldValue::Unsigned32(1)));
    item_fields("m_EconGloves", &paint, 3, out);
    paint_attributes(entity, GLOVE_PREFIX, &paint, out);
    // Zähler, an dem der Client neue Handschuhe erkennt.
    out.push(("m_nEconGlovesChanged".into(), FieldValue::Unsigned8(1)));
    Some(true)
}

/// Für `compare`: Felder, die der Skin-Tausch ändern darf.
pub fn is_skin_field(name: &str) -> bool {
    name.starts_with("m_AttributeManager.m_Item.")
        || name.starts_with("m_EconGloves.")
        || name == "m_nEconGlovesChanged"
        || name.starts_with("m_nFallback")
        || name == "m_flFallbackWear"
        || name == "m_nSubclassID"
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::SkinRequest;

    fn req(kind: &str, def: u32, side: Option<&str>, paint: u32) -> SkinRequest {
        SkinRequest { kind: kind.into(), def, side: side.map(Into::into), paint_kit: paint, seed: 1, wear: 0.1, legacy: None }
    }

    #[test]
    fn knife_models_match_real_demo() {
        assert_eq!(resource_id(knife_model(507).unwrap()), 1494623824775979189);
        assert_eq!(resource_id(knife_model(515).unwrap()), 13478092056631755737);
        assert_eq!(resource_id(knife_model(42).unwrap()), 10602312940084141493);
        assert_eq!(resource_id(knife_model(59).unwrap()), 7398392065489137260);
        // m_nSubclassID ist das String-Token der Item-Definition.
        assert_eq!(string_token("507"), 1731408398);
        assert_eq!(string_token("61"), 2343690088);
    }

    #[test]
    fn skins_are_checked() {
        let id = "76561197992597660";
        let ok = player_skins(id, &[req("weapon", 7, None, 180), req("knife", 507, Some("t"), 0), req("glove", 5030, None, 10037)])
            .unwrap();
        assert!(ok.weapons.contains_key(&7));
        assert!(ok.knife[0].is_some() && ok.knife[1].is_none());
        assert!(ok.glove[0].is_some() && ok.glove[1].is_some());
        assert!(player_skins(id, &[req("weapon", 500, None, 1)]).is_err());
        assert!(player_skins(id, &[req("weapon", 7, None, 0)]).is_err());
        assert!(player_skins(id, &[req("knife", 7, None, 0)]).is_err());
        assert!(player_skins(id, &[req("glove", 5030, Some("x"), 1)]).is_err());
        assert!(player_skins(id, &[req("sticker", 1, None, 1)]).is_err());
    }

    #[test]
    fn killfeed_names_cover_every_knife() {
        for (def, _) in KNIVES {
            assert!(killfeed_name(def).is_some(), "Messer {def} fehlt im Killfeed");
        }
        assert!(is_knife_kill("knife_t") && is_knife_kill("bayonet") && !is_knife_kill("glock"));
        // Echte Demo: Glock ohne Skin = 0xF000000000000004.
        let p = Paint { def: 4, paint: 0, seed: 0, wear: 0.0, legacy: None, item_id: 0 };
        assert_eq!(faux_item_id(&p), 17293822569102704644);
        let k = Paint { def: 507, paint: 38, ..p };
        assert_eq!(faux_item_id(&k), 0xF000_0000_0026_01FB);
    }

    #[test]
    fn item_ids_are_stable_and_marked() {
        let p = Paint { def: 7, paint: 180, seed: 1, wear: 0.1, legacy: None, item_id: 0 };
        assert_eq!(item_id("1", "weapon", &p), item_id("1", "weapon", &p));
        assert_ne!(item_id("1", "weapon", &p), item_id("2", "weapon", &p));
        assert!(item_id("1", "weapon", &p) >> 60 == 0xF);
    }
}
