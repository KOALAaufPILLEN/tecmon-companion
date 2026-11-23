import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { BIND_KEYS, CFG_CATALOG, CFG_GROUPS, cfgCommands, cfgText, createCfgLibrary, cleanKey } from "../cfg-library.mjs";
import { DEFAULT_OVERLAY, createOverlaySettings, cs2WindowMode, OVERLAY_NOTICE_VERSION, windowModeFromVideo } from "../crosshair.mjs";

/** Erlaubte CS2-Befehle der Sammlung: nur Einstellungen, Binds und Trainings-Befehle. */
const ALLOWED = /^(bind "[a-z0-9_]+" "[a-z0-9_ ;.+-]+"|(cl|snd|viewmodel|voice|fps|mp|sv|bot|ammo)_[a-z0-9_]+( [-0-9.]+)?|sv_cheats 1|bot_kick|mp_warmup_end)$/;

test("CFG-Sammlung: nur feste, harmlose Befehle in bekannten Gruppen", () => {
  const groups = new Set(CFG_GROUPS.map((g) => g.id));
  const ids = new Set();
  for (const entry of CFG_CATALOG) {
    assert.ok(groups.has(entry.group), entry.id);
    assert.ok(!ids.has(entry.id), `doppelt: ${entry.id}`);
    ids.add(entry.id);
    assert.match(entry.id, /^[a-z0-9_]+$/);
    for (const line of cfgCommands(entry.id, entry.defaultKey)) {
      assert.match(line, ALLOWED, `${entry.id}: ${line}`);
      assert.doesNotMatch(line, /sensitivity|m_yaw|m_pitch|\+attack|\+jump.*-attack|alias/, `${entry.id}: ${line}`);
    }
    if (entry.bind) assert.ok(BIND_KEYS.includes(entry.defaultKey), entry.id);
  }
});

test("Taste kommt nur aus der Liste, freier Text wird nie übernommen", () => {
  const mute = CFG_CATALOG.find((c) => c.id === "mute_toggle");
  assert.equal(cleanKey(mute, "F8"), "f8");
  assert.equal(cleanKey(mute, 'f8"; quit; bind "x'), "f6");
  assert.deepEqual(cfgCommands("mute_toggle", "mouse5"), ['bind "mouse5" "toggle voice_enable 0 1"']);
  assert.equal(cfgCommands("gibts-nicht"), null);
  assert.match(cfgText("pro_niko"), /cl_crosshairdot 1[\s\S]*viewmodel_fov 68[\s\S]*cl_radar_scale 0.35/);
});

test("cfg schreiben, entfernen und beim Paket-Entfernen aufräumen", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "tecmon-cfg-"));
  const exe = path.join(root, "game", "bin", "win64", "cs2.exe");
  const cfgDir = path.join(root, "game", "csgo", "cfg");
  await mkdir(cfgDir, { recursive: true });
  await writeFile(path.join(cfgDir, "autoexec.cfg"), "// eigene\n");
  const lib = await createCfgLibrary(path.join(root, "profil"));
  const result = await lib.install("mute_toggle", "f9", exe);
  assert.equal(result.written, true);
  assert.equal(result.exec, "exec tecmon_cfg_mute_toggle");
  assert.match(await readFile(path.join(cfgDir, "tecmon_cfg_mute_toggle.cfg"), "utf8"), /bind "f9" "toggle voice_enable 0 1"/);
  await lib.install("quiet_music", "", exe);
  const state = lib.state(exe);
  assert.equal(state.items.find((i) => i.id === "mute_toggle").key, "f9");
  assert.equal(state.items.find((i) => i.id === "quiet_music").installed, true);
  const again = await createCfgLibrary(path.join(root, "profil"));
  assert.equal(again.state(exe).items.find((i) => i.id === "mute_toggle").installed, true);
  await lib.remove("quiet_music", exe);
  assert.deepEqual((await readdir(cfgDir)).sort(), ["autoexec.cfg", "tecmon_cfg_mute_toggle.cfg"]);
  await lib.reset(exe);
  assert.deepEqual(await readdir(cfgDir), ["autoexec.cfg"]);
  await assert.rejects(lib.install("x", "", exe), /gibt es nicht/);
});

test("Overlay: nur nach bestätigtem Hinweis, standardmäßig aus", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tecmon-overlay-"));
  const overlay = await createOverlaySettings(dir);
  assert.deepEqual(overlay.get(), { ...DEFAULT_OVERLAY, enabled: false, accepted: false });
  await assert.rejects(overlay.set(true, undefined), /Hinweis/);
  assert.deepEqual(await overlay.set(true, OVERLAY_NOTICE_VERSION), { ...DEFAULT_OVERLAY, enabled: true, accepted: true });
  assert.deepEqual((await createOverlaySettings(dir)).get(), { ...DEFAULT_OVERLAY, enabled: true, accepted: true });
  await overlay.set(false);
  assert.deepEqual(await overlay.set(true), { ...DEFAULT_OVERLAY, enabled: true, accepted: true });
  await overlay.reset();
  assert.deepEqual((await createOverlaySettings(dir)).get(), { ...DEFAULT_OVERLAY, enabled: false, accepted: false });
});

test("Anzeigemodus aus cs2_video.txt", async () => {
  assert.equal(windowModeFromVideo('"setting.fullscreen"\t\t"1"'), "fullscreen");
  assert.equal(windowModeFromVideo('"setting.fullscreen" "0"\n"setting.nowindowborder" "1"'), "borderless");
  assert.equal(windowModeFromVideo('"setting.fullscreen" "0"'), "windowed");
  assert.equal(windowModeFromVideo(""), "unknown");
  const steam = await mkdtemp(path.join(tmpdir(), "tecmon-steam-"));
  assert.equal(await cs2WindowMode(steam), "unknown");
  const cfg = path.join(steam, "userdata", "123", "730", "local", "cfg");
  await mkdir(cfg, { recursive: true });
  await writeFile(path.join(cfg, "cs2_video.txt"), '"video.cfg"\n{\n\t"setting.fullscreen"\t\t"0"\n\t"setting.nowindowborder"\t\t"1"\n}\n');
  assert.equal(await cs2WindowMode(steam), "borderless");
});
