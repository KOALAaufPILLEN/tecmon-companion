//! TecMon-Demo-Rewriter: tauscht Agentenmodelle in einer Kopie einer CS2-Demo.
//!
//! Eigener Code des TecMon Companion (MIT). Nutzt die Bibliothek
//! `source2-demo` (MIT OR Apache-2.0) von Artem Rupasov.
//!
//! Aufrufe:
//!   tecmon-demo-rewriter inspect <demo.dem> <tmp-out.dem>
//!   tecmon-demo-rewriter rewrite <auftrag.json>

use anyhow::{anyhow, bail, Context as _, Result};
use serde::Deserialize;
use source2_demo::prelude::*;
use source2_demo::writer::*;
use std::collections::{BTreeMap, BTreeSet, HashMap};
use std::fs::File;
use std::io::{BufReader, BufWriter};

const MODEL_FIELD: &str = "CBodyComponent.m_skeletonInstance.m_modelState.m_hModel";
const BODYGROUP_PREFIX: &str = "CBodyComponent.m_skeletonInstance.m_modelState.m_nBodyGroupChoices.";
const BODYGROUP_LEN: &str = "CBodyComponent.m_skeletonInstance.m_modelState.m_nBodyGroupChoices";
const MESH_FIELD: &str = "CBodyComponent.m_skeletonInstance.m_modelState.m_MeshGroupMask";
const GLOVES_FIELD: &str = "m_EconGloves.m_iItemDefinitionIndex";
const RESOURCE_SEED: u64 = 0xEDAB_CDEF;
const MAX_PLAYERS: usize = 10;

/// MurmurHash64B (Austin Appleby, gemeinfrei) über den kleingeschriebenen Pfad.
/// So bildet CS2 die Ressourcen-ID, die in `m_hModel` steht.
pub fn resource_id(path: &str) -> u64 {
    let data: Vec<u8> = path.replace('\\', "/").to_ascii_lowercase().into_bytes();
    const M: u32 = 0x5bd1_e995;
    const R: u32 = 24;
    let mut h1: u32 = (RESOURCE_SEED as u32) ^ (data.len() as u32);
    let mut h2: u32 = (RESOURCE_SEED >> 32) as u32;
    let word = |i: usize| u32::from_le_bytes([data[i], data[i + 1], data[i + 2], data[i + 3]]);
    let mix = |mut k: u32| {
        k = k.wrapping_mul(M);
        k ^= k >> R;
        k.wrapping_mul(M)
    };
    let mut i = 0;
    let mut rest = data.len();
    while rest >= 8 {
        h1 = h1.wrapping_mul(M) ^ mix(word(i));
        h2 = h2.wrapping_mul(M) ^ mix(word(i + 4));
        i += 8;
        rest -= 8;
    }
    if rest >= 4 {
        h1 = h1.wrapping_mul(M) ^ mix(word(i));
        i += 4;
        rest -= 4;
    }
    if rest > 0 {
        if rest >= 3 {
            h2 ^= (data[i + 2] as u32) << 16;
        }
        if rest >= 2 {
            h2 ^= (data[i + 1] as u32) << 8;
        }
        h2 ^= data[i] as u32;
        h2 = h2.wrapping_mul(M);
    }
    h1 ^= h2 >> 18;
    h1 = h1.wrapping_mul(M);
    h2 ^= h1 >> 22;
    h2 = h2.wrapping_mul(M);
    h1 ^= h2 >> 17;
    h1 = h1.wrapping_mul(M);
    h2 ^= h1 >> 19;
    h2 = h2.wrapping_mul(M);
    ((h1 as u64) << 32) | h2 as u64
}

fn as_u64(value: &FieldValue) -> Option<u64> {
    Some(match value {
        FieldValue::Unsigned8(v) => *v as u64,
        FieldValue::Unsigned16(v) => *v as u64,
        FieldValue::Unsigned32(v) => *v as u64,
        FieldValue::Unsigned64(v) => *v,
        FieldValue::Signed8(v) => *v as u64,
        FieldValue::Signed16(v) => *v as u64,
        FieldValue::Signed32(v) => *v as u64,
        FieldValue::Signed64(v) => *v as u64,
        FieldValue::Boolean(v) => *v as u64,
        _ => return None,
    })
}

fn prop(entity: &Entity, name: &str) -> Option<u64> {
    entity.get_property(name).ok().and_then(as_u64)
}

/// SteamID64 des Spielers zu einem Pawn, als Text.
fn pawn_steamid(ctx: &Context, pawn: &Entity) -> Option<String> {
    let handle = prop(pawn, "m_hController")? as usize;
    let controller = ctx.entities().get_by_handle(handle).ok()?;
    let id = prop(controller, "m_steamID")?;
    (id > 76_561_197_960_265_728).then(|| id.to_string())
}

// ---------------------------------------------------------------- Auftrag

#[derive(Deserialize)]
struct Request {
    /// Demo, die umgeschrieben wird (z. B. die Ausgabe des Skin-Tauschs).
    input: String,
    output: String,
    /// Unveränderte Original-Demo zum Lernen der Bodygroups (optional).
    #[serde(default)]
    learn: Option<String>,
    /// Lokale Datei mit gelernten Bodygroups aus früheren Demos (optional).
    #[serde(default)]
    looks_cache: Option<String>,
    players: Vec<PlayerRequest>,
}

#[derive(Deserialize)]
struct PlayerRequest {
    steamid: String,
    #[serde(default)]
    t: Option<String>,
    #[serde(default)]
    ct: Option<String>,
}

fn valid_model(path: &str) -> Result<String> {
    let p = path.replace('\\', "/").to_ascii_lowercase();
    let ok = (p.starts_with("agents/models/") || p.starts_with("characters/models/"))
        && p.ends_with(".vmdl")
        && p.len() < 128
        && p.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b"/_.-".contains(&b))
        && !p.contains("..");
    if !ok {
        bail!("ungültiger Modellpfad: {path}");
    }
    Ok(p)
}

/// Mesh-Maske passend zu den Bodygroups. Jede Bodygroup der Spielermodelle
/// hat zwei Möglichkeiten; ein Bit je Möglichkeit.
fn mesh_from(bodygroups: &[i32], known: Option<&Look>) -> u64 {
    match known {
        Some(base) if base.bodygroups.len() == bodygroups.len() => {
            let mut mesh = base.mesh;
            for (i, (&old, &new)) in base.bodygroups.iter().zip(bodygroups).enumerate() {
                if old != new && (0..2).contains(&old) && (0..2).contains(&new) {
                    mesh &= !(1u64 << (2 * i as u32 + old as u32));
                    mesh |= 1u64 << (2 * i as u32 + new as u32);
                }
            }
            mesh
        }
        _ => bodygroups
            .iter()
            .enumerate()
            .filter(|(i, _)| *i < 32)
            .map(|(i, &c)| 1u64 << (2 * i as u32 + c.clamp(0, 1) as u32))
            .sum(),
    }
}

/// Wie soll ein Modell mit oder ohne Handschuhe aussehen? `exact` ist
/// false, wenn geschätzt werden musste.
pub fn wanted_look(looks: &Looks, model: u64, gloves: bool, fallback_len: usize) -> (Look, bool) {
    let entry = looks.get(&format!("{model:016x}"));
    let want = if gloves { "gloves" } else { "plain" };
    let other = if gloves { "plain" } else { "gloves" };
    if let Some(look) = entry.and_then(|e| e.get(want)) {
        return (look.clone(), true);
    }
    if let Some(base) = entry.and_then(|e| e.get(other)) {
        let mut bodygroups = base.bodygroups.clone();
        if gloves {
            // Platz der Standard-Handschuhe unbekannt: meist der erste.
            if let Some(first) = bodygroups.first_mut() {
                *first = 1;
            }
        } else {
            for value in bodygroups.iter_mut() {
                *value = 0;
            }
        }
        let mesh = mesh_from(&bodygroups, Some(base));
        return (Look { bodygroups, mesh }, false);
    }
    let mut bodygroups = vec![0; fallback_len.clamp(1, 4)];
    bodygroups[0] = gloves as i32;
    let mesh = mesh_from(&bodygroups, None);
    (Look { bodygroups, mesh }, false)
}

#[derive(Default)]
struct AgentSwap {
    /// SteamID64 -> Team (2 = T, 3 = CT) -> Ressourcen-ID
    models: HashMap<String, HashMap<u64, u64>>,
    looks: Looks,
    changed: BTreeMap<String, usize>,
    guessed: BTreeSet<String>,
}

/// Gewünschte Werte für einen Pawn: Feldname -> Wert.
fn wanted_fields(swap: &mut AgentSwap, ctx: &Context, entity: &Entity) -> Option<Vec<(String, FieldValue)>> {
    let steamid = pawn_steamid(ctx, entity)?;
    let team = prop(entity, "m_iTeamNum")?;
    if team != 2 && team != 3 {
        return None;
    }
    let player = swap.models.get(&steamid)?;
    let current = prop(entity, MODEL_FIELD).filter(|m| *m != 0)?;
    let model = player.get(&team).copied().unwrap_or(current);
    let gloves = prop(entity, GLOVES_FIELD).unwrap_or(0) != 0;
    let len = prop(entity, BODYGROUP_LEN).unwrap_or(1) as usize;
    let (look, exact) = wanted_look(&swap.looks, model, gloves, len);
    if !exact {
        swap.guessed.insert(format!("{model:016x}"));
    }
    let mut fields = vec![
        (MODEL_FIELD.to_string(), FieldValue::Unsigned64(model)),
        (MESH_FIELD.to_string(), FieldValue::Unsigned64(look.mesh)),
        (BODYGROUP_LEN.to_string(), FieldValue::Unsigned32(look.bodygroups.len() as u32)),
    ];
    for (slot, value) in look.bodygroups.iter().enumerate() {
        fields.push((format!("{BODYGROUP_PREFIX}{slot:04}"), FieldValue::Signed32(*value)));
    }
    Some(fields)
}

impl DemoRewriter for AgentSwap {
    fn interests(&self) -> RewriteInterests {
        RewriteInterests::ENTITY_FIELDS
    }

    fn should_rewrite_entity(&mut self, _ctx: &Context, _e: EntityEvents, entity: &Entity) -> bool {
        entity.class().name() == "CCSPlayerPawn"
    }

    fn should_track_entity(&mut self, _ctx: &Context, _e: EntityEvents, entity: &Entity) -> bool {
        let name = entity.class().name();
        name == "CCSPlayerPawn" || name == "CCSPlayerController"
    }

    fn replace_entity_field(
        &mut self,
        ctx: &Context,
        _event: EntityEvents,
        entity: &Entity,
        field_name: &str,
        value: &FieldValue,
    ) -> Option<FieldValue> {
        if !field_name.starts_with("CBodyComponent.m_skeletonInstance.m_modelState.m_") {
            return None;
        }
        let fields = wanted_fields(self, ctx, entity)?;
        let (_, wanted) = fields.into_iter().find(|(name, _)| name == field_name)?;
        if &wanted == value {
            return None;
        }
        Some(wanted)
    }

    fn extra_entity_fields(&mut self, ctx: &Context, _event: EntityEvents, entity: &Entity) -> Vec<(String, FieldValue)> {
        let Some(fields) = wanted_fields(self, ctx, entity) else {
            return Vec::new();
        };
        let missing: Vec<(String, FieldValue)> = fields
            .into_iter()
            .filter(|(name, value)| entity.get_property(name).ok() != Some(value))
            .collect();
        if !missing.is_empty() {
            if let Some(steamid) = pawn_steamid(ctx, entity) {
                *self.changed.entry(steamid).or_default() += 1;
            }
        }
        missing
    }
}

/// Eingebaute Werte aus echten Demos (Modell-ID -> Aussehen).
fn seed_looks() -> Looks {
    let mut looks = Looks::new();
    let mut add = |path: &str, kind: &str, bodygroups: Vec<i32>, mesh: u64| {
        looks
            .entry(format!("{:016x}", resource_id(path)))
            .or_default()
            .insert(kind.into(), Look { bodygroups, mesh });
    };
    add("agents/models/tm_phoenix/tm_phoenix.vmdl", "plain", vec![0], 1);
    add("agents/models/ctm_sas/ctm_sas.vmdl", "plain", vec![0, 0], 5);
    add("agents/models/tm_professional/tm_professional_varf.vmdl", "gloves", vec![1], 2);
    add("agents/models/ctm_fbi/ctm_fbi_variantb.vmdl", "gloves", vec![0, 1], 9);
    looks
}

fn merge_looks(into: &mut Looks, from: Looks) {
    for (model, kinds) in from {
        into.entry(model).or_default().extend(kinds);
    }
}

fn read_cache(path: &str) -> Looks {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str::<Looks>(&text).ok())
        .unwrap_or_default()
}

fn rewrite(request_path: &str) -> Result<()> {
    let text = std::fs::read_to_string(request_path).context("Auftrag nicht lesbar")?;
    let request: Request = serde_json::from_str(&text).context("Auftrag ungültig")?;
    if request.players.is_empty() || request.players.len() > MAX_PLAYERS {
        bail!("ungültige Spielerzahl");
    }
    let mut models: HashMap<String, HashMap<u64, u64>> = HashMap::new();
    for player in &request.players {
        if player.steamid.len() != 17 || !player.steamid.bytes().all(|b| b.is_ascii_digit()) {
            bail!("ungültige SteamID");
        }
        let entry = models.entry(player.steamid.clone()).or_default();
        if let Some(t) = &player.t {
            entry.insert(2, resource_id(&valid_model(t)?));
        }
        if let Some(ct) = &player.ct {
            entry.insert(3, resource_id(&valid_model(ct)?));
        }
    }
    if request.input == request.output {
        bail!("Ein- und Ausgabe müssen verschieden sein");
    }

    let mut looks = seed_looks();
    if let Some(cache) = &request.looks_cache {
        merge_looks(&mut looks, read_cache(cache));
    }
    if let Some(original) = &request.learn {
        let learned = learn(original)?;
        if let Some(cache) = &request.looks_cache {
            let mut stored = read_cache(cache);
            merge_looks(&mut stored, learned.clone());
            let _ = std::fs::write(cache, serde_json::to_string(&stored)?);
        }
        merge_looks(&mut looks, learned);
    }

    let input = BufReader::new(File::open(&request.input).context("Demo nicht lesbar")?);
    let output = BufWriter::new(File::create(&request.output).context("Ausgabe nicht schreibbar")?);
    let mut writer = DemoWriter::from_reader(input, output).map_err(|e| anyhow!("{e}"))?;
    let swap = writer.register_rewriter::<AgentSwap>();
    {
        let mut swap = swap.borrow_mut();
        swap.models = models;
        swap.looks = looks;
    }
    writer.run().map_err(|e| anyhow!("{e}"))?;
    drop(writer);
    let swap = swap.borrow();
    println!(
        "{}",
        serde_json::json!({ "ok": true, "changed": swap.changed, "guessed": swap.guessed })
    );
    Ok(())
}

// ---------------------------------------------------------------- Lernen

/// Aussehen eines Spielermodells: Bodygroups und Mesh-Maske, wie CS2 sie
/// selbst gesetzt hat.
#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, serde::Serialize, Deserialize)]
pub struct Look {
    pub bodygroups: Vec<i32>,
    pub mesh: u64,
}

/// Modell-ID (hex) -> "gloves" | "plain" -> Aussehen
pub type Looks = BTreeMap<String, BTreeMap<String, Look>>;

fn current_look(entity: &Entity) -> Option<(u64, bool, Look)> {
    let model = prop(entity, MODEL_FIELD).filter(|m| *m != 0)?;
    let count = prop(entity, BODYGROUP_LEN).unwrap_or(0).min(16) as usize;
    let mut bodygroups = Vec::with_capacity(count);
    for slot in 0..count {
        bodygroups.push(prop(entity, &format!("{BODYGROUP_PREFIX}{slot:04}")).unwrap_or(0) as i32);
    }
    let mesh = prop(entity, MESH_FIELD).unwrap_or(0);
    let gloves = prop(entity, GLOVES_FIELD).unwrap_or(0) != 0;
    Some((model, gloves, Look { bodygroups, mesh }))
}

#[derive(Default)]
struct Learner {
    seen: HashMap<(u64, bool), HashMap<Look, usize>>,
}

impl Observer for Learner {
    fn interests(&self) -> Interests {
        Interests::ENTITY_STATE | Interests::ENTITY_EVENTS
    }

    fn on_entity(&mut self, _ctx: &Context, event: EntityEvents, entity: &Entity) -> ObserverResult {
        if event == EntityEvents::Deleted || entity.class().name() != "CCSPlayerPawn" {
            return Ok(());
        }
        let team = prop(entity, "m_iTeamNum").unwrap_or(0);
        if team != 2 && team != 3 {
            return Ok(());
        }
        if let Some((model, gloves, look)) = current_look(entity) {
            *self.seen.entry((model, gloves)).or_default().entry(look).or_default() += 1;
        }
        Ok(())
    }
}

/// Zur Prüfung: Aussehen je Spieler nach jedem Entity-Ereignis.
#[derive(Default)]
struct PlayerLooks {
    seen: BTreeMap<String, BTreeMap<String, usize>>,
}

impl Observer for PlayerLooks {
    fn interests(&self) -> Interests {
        Interests::ENTITY_STATE | Interests::ENTITY_EVENTS
    }

    fn on_entity(&mut self, ctx: &Context, event: EntityEvents, entity: &Entity) -> ObserverResult {
        if event == EntityEvents::Deleted || entity.class().name() != "CCSPlayerPawn" {
            return Ok(());
        }
        let team = prop(entity, "m_iTeamNum").unwrap_or(0);
        if let (Some(steamid), Some((model, gloves, look))) = (pawn_steamid(ctx, entity), current_look(entity)) {
            let key = format!("team={team} model={model:016x} gloves={gloves} bg={:?} mesh={}", look.bodygroups, look.mesh);
            *self.seen.entry(steamid).or_default().entry(key).or_default() += 1;
        }
        Ok(())
    }
}

fn player_looks(demo: &str) -> Result<()> {
    let input = BufReader::new(File::open(demo)?);
    let mut parser = Parser::from_reader(input).map_err(|e| anyhow!("{e}"))?;
    let looks = parser.register_observer::<PlayerLooks>();
    parser.run_to_end().map_err(|e| anyhow!("{e}"))?;
    for (steamid, keys) in &looks.borrow().seen {
        println!("{steamid}");
        for (key, n) in keys {
            println!("  {key}  x{n}");
        }
    }
    Ok(())
}

/// Zur Prüfung: Prüfsumme aller Entity-Felder je Ereignis, ohne
/// Modell-/Bodygroup-Felder der Pawns.
#[derive(Default)]
struct Fingerprint {
    events: Vec<u64>,
    detail: Vec<Vec<String>>,
}

impl Observer for Fingerprint {
    fn interests(&self) -> Interests {
        Interests::ENTITY_STATE | Interests::ENTITY_EVENTS
    }

    fn on_entity(&mut self, ctx: &Context, event: EntityEvents, entity: &Entity) -> ObserverResult {
        use std::hash::{Hash, Hasher};
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        (ctx.tick(), entity.index(), entity.class().name(), event as u8).hash(&mut hasher);
        let keep = self.detail.len() < 2000;
        let mut lines = Vec::new();
        if keep {
            lines.push(format!("tick {} #{} {} {:?}", ctx.tick(), entity.index(), entity.class().name(), event));
        }
        if event != EntityEvents::Deleted {
            for field in entity.fields() {
                if field.name.contains("m_modelState.m_") {
                    continue;
                }
                let value = format!("{:?}", field.value);
                field.name.hash(&mut hasher);
                value.hash(&mut hasher);
                if keep {
                    lines.push(format!("{} = {value}", field.name));
                }
            }
        }
        if keep {
            self.detail.push(lines);
        }
        self.events.push(hasher.finish());
        Ok(())
    }
}

fn fingerprint(demo: &str) -> Result<(Vec<u64>, Vec<Vec<String>>)> {
    let input = BufReader::new(File::open(demo)?);
    let mut parser = Parser::from_reader(input).map_err(|e| anyhow!("{e}"))?;
    let print = parser.register_observer::<Fingerprint>();
    parser.run_to_end().map_err(|e| anyhow!("{e}"))?;
    let events = std::mem::take(&mut print.borrow_mut().events);
    let detail = std::mem::take(&mut print.borrow_mut().detail);
    Ok((events, detail))
}

fn compare(a: &str, b: &str) -> Result<()> {
    let ((left, left_detail), (right, right_detail)) = (fingerprint(a)?, fingerprint(b)?);
    let first = left.iter().zip(&right).position(|(x, y)| x != y);
    println!(
        "Ereignisse: {} / {}, erste Abweichung: {:?}",
        left.len(),
        right.len(),
        first
    );
    if let Some(i) = first {
        if let (Some(l), Some(r)) = (left_detail.get(i), right_detail.get(i)) {
            println!("{}", l[0]);
            for line in l.iter().filter(|line| !r.contains(line)) {
                println!("  - {line}");
            }
            for line in r.iter().filter(|line| !l.contains(line)) {
                println!("  + {line}");
            }
        }
    }
    if first.is_some() || left.len() != right.len() {
        bail!("Demos weichen außerhalb der Modellfelder ab");
    }
    Ok(())
}

/// Liest aus einer unveränderten Demo, wie CS2 jedes Modell mit und ohne
/// Handschuhe darstellt (häufigster Stand).
fn learn(demo: &str) -> Result<Looks> {
    let input = BufReader::new(File::open(demo).context("Demo nicht lesbar")?);
    let mut parser = Parser::from_reader(input).map_err(|e| anyhow!("{e}"))?;
    let learner = parser.register_observer::<Learner>();
    parser.run_to_end().map_err(|e| anyhow!("{e}"))?;
    let mut looks = Looks::new();
    for ((model, gloves), counts) in learner.borrow().seen.iter() {
        if let Some((look, _)) = counts.iter().max_by_key(|(look, n)| (**n, (*look).clone())) {
            looks
                .entry(format!("{model:016x}"))
                .or_default()
                .insert(if *gloves { "gloves" } else { "plain" }.into(), look.clone());
        }
    }
    Ok(looks)
}

// ---------------------------------------------------------------- Prüfen

/// Schreibt zur Fehlersuche auf, welche Modell-, Bodygroup- und
/// Handschuhwerte die Pawns tragen und welche Felder beim Erzeugen im
/// Paket stehen. Ändert nichts.
#[derive(Default)]
struct Probe {
    created_fields: BTreeMap<String, usize>,
    created: usize,
    created_with_model: usize,
    looks: BTreeMap<String, BTreeSet<String>>,
}

impl DemoRewriter for Probe {
    fn interests(&self) -> RewriteInterests {
        RewriteInterests::ENTITY_FIELDS
    }

    fn should_rewrite_entity(&mut self, ctx: &Context, event: EntityEvents, entity: &Entity) -> bool {
        if entity.class().name() != "CCSPlayerPawn" {
            return false;
        }
        if event == EntityEvents::Created {
            self.created += 1;
        }
        let steamid = pawn_steamid(ctx, entity).unwrap_or_else(|| "?".into());
        let mut look = format!(
            "team={} model={:016x} gloves={}",
            prop(entity, "m_iTeamNum").unwrap_or(0),
            prop(entity, MODEL_FIELD).unwrap_or(0),
            prop(entity, "m_EconGloves.m_iItemDefinitionIndex").unwrap_or(0),
        );
        for slot in 0..4 {
            if let Some(v) = prop(entity, &format!("{BODYGROUP_PREFIX}{slot:04}")) {
                look.push_str(&format!(" bg{slot}={}", v as i64));
            }
        }
        self.looks.entry(steamid).or_default().insert(look);
        true
    }

    fn should_track_entity(&mut self, _ctx: &Context, _e: EntityEvents, entity: &Entity) -> bool {
        let name = entity.class().name();
        name == "CCSPlayerPawn" || name == "CCSPlayerController"
    }

    fn replace_entity_field(
        &mut self,
        _ctx: &Context,
        event: EntityEvents,
        _entity: &Entity,
        field_name: &str,
        _value: &FieldValue,
    ) -> Option<FieldValue> {
        if event == EntityEvents::Created
            && (field_name.contains("m_modelState") || field_name.starts_with("m_EconGloves.m_iItemDef"))
        {
            *self.created_fields.entry(format!("{field_name} ({})", _value.type_name())).or_default() += 1;
            if field_name == MODEL_FIELD {
                self.created_with_model += 1;
            }
        }
        None
    }
}

fn inspect(demo: &str, scratch: &str) -> Result<()> {
    let input = BufReader::new(File::open(demo)?);
    let output = BufWriter::new(File::create(scratch)?);
    let mut writer = DemoWriter::from_reader(input, output).map_err(|e| anyhow!("{e}"))?;
    let probe = writer.register_rewriter::<Probe>();
    writer.run().map_err(|e| anyhow!("{e}"))?;
    let _ = std::fs::remove_file(scratch);
    let probe = probe.borrow();
    println!("Pawns erzeugt: {}, davon mit m_hModel im Paket: {}", probe.created, probe.created_with_model);
    for (name, count) in &probe.created_fields {
        println!("  beim Erzeugen: {name} x{count}");
    }
    for (steamid, looks) in &probe.looks {
        println!("{steamid}");
        for look in looks {
            println!("  {look}");
        }
    }
    Ok(())
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("inspect") if args.len() == 4 => inspect(&args[2], &args[3]),
        Some("rewrite") if args.len() == 3 => rewrite(&args[2]),
        Some("looks") if args.len() == 3 => player_looks(&args[2]),
        Some("compare") if args.len() == 4 => compare(&args[2], &args[3]),
        Some("learn") if args.len() == 3 => {
            println!("{}", serde_json::to_string_pretty(&learn(&args[2])?)?);
            Ok(())
        }
        Some("hash") if args.len() == 3 => {
            println!("{:016x}", resource_id(&args[2]));
            Ok(())
        }
        _ => bail!("Aufruf: inspect <demo> <tmp> | rewrite <auftrag.json> | hash <pfad>"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resource_ids_match_real_demo() {
        assert_eq!(resource_id("agents/models/ctm_sas/ctm_sas.vmdl"), 0xdfab7cb9fec05111);
        assert_eq!(resource_id("agents/models/tm_phoenix/tm_phoenix.vmdl"), 0xc78dd1a3fe45c901);
        assert_eq!(resource_id("agents/models/ctm_fbi/ctm_fbi_variantb.vmdl"), 0x820d2c0493aa15e9);
    }

    #[test]
    fn mesh_mask_follows_bodygroups() {
        assert_eq!(mesh_from(&[0], None), 1);
        assert_eq!(mesh_from(&[1], None), 2);
        assert_eq!(mesh_from(&[0, 0], None), 5);
        assert_eq!(mesh_from(&[0, 1], None), 9);
    }

    #[test]
    fn looks_use_known_values_first() {
        let looks = seed_looks();
        let fbi = resource_id("agents/models/ctm_fbi/ctm_fbi_variantb.vmdl");
        assert_eq!(wanted_look(&looks, fbi, true, 2), (Look { bodygroups: vec![0, 1], mesh: 9 }, true));
        assert_eq!(wanted_look(&looks, fbi, false, 2), (Look { bodygroups: vec![0, 0], mesh: 5 }, false));
        let sas = resource_id("agents/models/ctm_sas/ctm_sas.vmdl");
        assert_eq!(wanted_look(&looks, sas, true, 2), (Look { bodygroups: vec![1, 0], mesh: 6 }, false));
    }

    #[test]
    fn model_paths_are_checked() {
        assert!(valid_model("characters/models/ctm_sas/ctm_sas.vmdl").is_ok());
        assert!(valid_model("agents/models/ctm_sas/ctm_sas.vmdl").is_ok());
        assert!(valid_model("characters/models/../x.vmdl").is_err());
        assert!(valid_model("weapons/models/knife.vmdl").is_err());
        assert!(valid_model("characters/models/a b.vmdl").is_err());
    }

    #[test]
    fn resource_id_ignores_case() {
        assert_eq!(
            resource_id("characters/models/ctm_sas/ctm_sas.vmdl"),
            resource_id("Characters\\Models\\CTM_SAS\\ctm_sas.vmdl")
        );
    }
}
