import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile, writeFile, readdir, access, mkdir } from "node:fs/promises";
import { EventEmitter, once } from "node:events";
import os from "node:os";
import path from "node:path";
import { createClips, cleanClipSettings, ringArgs, parseAudioDevices, brandedName, ENCODERS, CLIP_CAPABILITY } from "../clips.mjs";
import { clipLabels, renderClipBranding } from "../clip-branding.mjs";
import { createCompanion } from "../server.mjs";

const exists = (file) => access(file).then(() => true, () => false);

/** Nachgebautes FFmpeg: Ringpuffer schreibt Stücke, Concat schreibt die Ausgabedatei. */
function fakeFfmpeg({ failing = [] } = {}) {
  const calls = [];
  const spawn = (exe, args, options) => {
    const proc = new EventEmitter();
    proc.stderr = new EventEmitter();
    proc.killed = false;
    proc.kill = () => {
      proc.killed = true;
      setImmediate(() => proc.emit("close", null));
    };
    const call = { exe, args, cwd: options.cwd };
    calls.push(call);
    setImmediate(async () => {
      if (args.includes("segment")) {
        const encoder = args[args.indexOf("-c:v") + 1];
        if (failing.includes(encoder)) {
          proc.stderr.emit("data", "No NVENC capable devices found\n");
          proc.emit("close", 1);
          return;
        }
        for (let i = 0; i < 6; i++) {
          await writeFile(path.join(options.cwd, `seg${String(i).padStart(3, "0")}.ts`), `segment-${i}`);
          await new Promise((r) => setTimeout(r, 5));
        }
      } else if (args.includes("concat")) {
        call.list = await readFile(path.join(options.cwd, args[args.indexOf("-i") + 1]), "utf8");
        await writeFile(args.at(-1), "mp4");
        proc.emit("close", 0);
      } else if (args.includes("-list_devices")) {
        proc.stderr.emit("data", '[dshow] "Stereomix (Realtek(R) Audio)" (audio)\n[dshow] "OBS Virtual Camera" (video)\n');
        proc.emit("close", 1);
      }
    });
    return proc;
  };
  return { spawn, calls };
}

test("Clip-Einstellungen: Grenzen werden geprüft, Gerätename bereinigt", () => {
  const base = cleanClipSettings({});
  assert.equal(base.enabled, false, "standardmäßig aus");
  assert.equal(cleanClipSettings({ seconds: 60, fps: 60, height: 720 }).seconds, 60);
  assert.throws(() => cleanClipSettings({ seconds: 5 }), /zwischen/);
  assert.throws(() => cleanClipSettings({ seconds: 600 }), /zwischen/);
  assert.throws(() => cleanClipSettings({ fps: 144 }), /30 oder 60/);
  assert.throws(() => cleanClipSettings({ height: 480 }), /Auflösung/);
  assert.equal(cleanClipSettings({ audioDevice: 'Mic" -i evil\n' }).audioDevice, "Mic -i evil");
});

test("Clip-Puffer: nur Bildschirm-Aufnahme, Ton als eigenes Argument, Ringpuffer", () => {
  const args = ringArgs({ fps: 30, height: 1080, audioDevice: "Stereomix (Realtek)", encoder: "libx264", wrap: 64 });
  assert.ok(args.includes("ddagrab=output_idx=0:framerate=30:draw_mouse=1"));
  assert.ok(args.includes("audio=Stereomix (Realtek)"), "Gerätename als ein Argument, keine Shell");
  assert.equal(args[args.indexOf("-segment_wrap") + 1], "64");
  assert.equal(args.at(-1), "seg%03d.ts");
  const silent = ringArgs({ fps: 60, height: 0, audioDevice: "", encoder: "h264_nvenc", wrap: 64 });
  assert.ok(silent.includes("-an"));
  assert.ok(!silent.includes("dshow"));
  assert.ok(!silent.join(" ").includes("scale="), "Bildschirmauflösung bleibt");
  assert.deepEqual(parseAudioDevices('"Stereomix (Realtek(R) Audio)" (audio)\n"Kamera" (video)'), ["Stereomix (Realtek(R) Audio)"]);
  assert.equal(CLIP_CAPABILITY, "clips-v1");
});

test("Clip-Puffer: fällt auf den nächsten Encoder zurück, speichert die letzten Sekunden und löscht den Puffer", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-clips-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const ff = fakeFfmpeg({ failing: ["h264_nvenc"] });
  const clips = await createClips({ dir, ffmpeg: "ffmpeg.exe", spawnProcess: ff.spawn, settleMs: 60, now: () => new Date(2026, 10, 13, 12, 30, 5) });
  await assert.rejects(clips.save(), /aus/);
  const state = await clips.setSettings({ enabled: true, seconds: 10 });
  assert.equal(state.recording, true);
  assert.equal(state.encoder, ENCODERS[1], "NVENC fehlt → nächster Encoder");
  assert.equal(JSON.parse(await readFile(path.join(dir, "clips.json"), "utf8")).enabled, true);

  const saved = await clips.save();
  assert.equal(saved.id, "clip-20261113-123005.mp4");
  const concat = ff.calls.find((c) => c.args.includes("concat"));
  assert.equal(concat.list, ["seg000.ts", "seg001.ts", "seg002.ts", "seg003.ts", "seg004.ts"].map((n) => `file '${n}'`).join("\n"), "neuestes Stück fehlt, 10 s = 5 Stücke");
  assert.equal((await clips.save()).id, "clip-20261113-123005-2.mp4", "keine Datei wird überschrieben");
  const list = await clips.list();
  assert.equal(list.length, 2);
  assert.equal(list[0].status, "raw");
  assert.throws(() => clips.clipPath("../geheim.mp4"), /nicht gefunden/);

  const ring = path.join(dir, "Clips", "puffer");
  assert.equal((await readdir(ring)).length > 0, true);
  await clips.setSettings({ enabled: false });
  assert.equal(await exists(ring), false, "Ausschalten löscht den Zwischenspeicher");
  assert.equal(clips.state().recording, false);
  await clips.remove(saved.id);
  assert.equal((await clips.list()).length, 1);
  assert.deepEqual(await clips.devices(), ["Stereomix (Realtek(R) Audio)"]);
});

test("Clip-Puffer: alter Zwischenspeicher wird beim Start gelöscht, ohne FFmpeg kein Start", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-clips-old-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, "Clips", "puffer"), { recursive: true });
  await writeFile(path.join(dir, "Clips", "puffer", "seg000.ts"), "alt");
  const clips = await createClips({ dir, ffmpeg: "" });
  assert.equal(await exists(path.join(dir, "Clips", "puffer")), false);
  assert.equal(clips.state().available, false);
  await assert.rejects(clips.setSettings({ enabled: true }), /FFmpeg fehlt/);
});

test("Clip-Branding: feste Spielnamen, bereinigter Titel, nur geprüfte Assets", async (t) => {
  assert.deepEqual(clipLabels({ game: "wardogs", title: "  1v3\nClutch  " }), { game: "wardogs", label: "WARDOGS", title: "1v3 Clutch" });
  assert.equal(clipLabels({ game: "<script>", title: "" }).label, "GAMEPLAY");
  assert.equal(clipLabels({ game: "valorant", title: "" }).title, "VALORANT · HIGHLIGHT");
  assert.equal(brandedName("clip-20261113-123005.mp4"), "clip-20261113-123005-tecmon.mp4");
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-clip-brand-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, "clip.mp4"), "mp4");
  let ran = false;
  await assert.rejects(
    renderClipBranding({ source: path.join(dir, "clip.mp4"), directory: dir, id: "clip-20261113-123005.mp4", game: "cs2", title: "", assets: { "logo.webp": Buffer.from("falsch") }, ffmpeg: "ffmpeg", launcher: "x", execute: async () => { ran = true; }, probe: async () => ({ width: 1920, height: 1080, fps: 30, duration: 10, audio: false }) }),
    /Prüfsumme/,
  );
  assert.equal(ran, false, "FFmpeg startet nie mit ungeprüften Assets");
  assert.equal(await exists(path.join(dir, "branding-work")), true);
  assert.deepEqual(await readdir(path.join(dir, "branding-work")), [], "Arbeitsordner wird aufgeräumt");
});

test("Clips: lokale API ohne Windows-Companion meldet fehlendes FFmpeg, Bridge ohne Clip-Capability", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "tecmon-clips-api-"));
  const { server, token } = await createCompanion({ dataDir: dir, detectTools: async () => ({ csdm: "", cs2: "" }) });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await rm(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const headers = { "x-tecmon-token": token, "content-type": "application/json" };
  const state = await (await fetch(base + "/api/clips", { headers })).json();
  assert.equal(state.buffer.enabled, false);
  assert.equal(state.buffer.available, false);
  assert.deepEqual(state.clips, []);
  const enable = await fetch(base + "/api/clips/settings", { method: "POST", headers, body: JSON.stringify({ enabled: true }) });
  assert.equal(enable.status, 400);
  assert.match((await enable.json()).error, /FFmpeg/);
  const brand = await fetch(base + "/api/clips/brand", { method: "POST", headers, body: JSON.stringify({ id: "clip-20261113-123005.mp4" }) });
  assert.match((await brand.json()).error, /Windows-Companion/);
  assert.equal((await fetch(base + "/api/clips")).status, 401, "nur mit lokalem Token");
});
