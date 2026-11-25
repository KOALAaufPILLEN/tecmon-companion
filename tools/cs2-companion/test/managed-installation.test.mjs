import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { applySetupChoices, availablePort, runTool, setupManagedInstallation, setupToolNames } from "../managed-installation.mjs";

test("process invocation preserves special characters and UTF8 stdin", async () => {
  const value = "quotes \" & apostrophe' ä spaces";
  const result = await runTool(
    process.execPath,
    [
      "-e",
      "let t='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>t+=x);process.stdin.on('end',()=>process.stdout.write(JSON.stringify([process.argv[1],t])))",
      value,
    ],
    { input: value },
  );
  assert.deepEqual(JSON.parse(result), [value, value]);
  await runTool(process.execPath, ["-e", "process.exit(0)"], { detachedStreams: true });
});
test("selects an available loopback port and rejects invalid ranges", async (t) => {
  const held = net.createServer();
  held.listen(0, "127.0.0.1");
  await once(held, "listening");
  t.after(() => new Promise((resolve) => held.close(resolve)));
  const port = held.address().port;
  if (port < 65400) assert.notEqual(await availablePort(port), port);
  await assert.rejects(availablePort(0), /Port/);
});
test("setup requires consent and a data folder, but no database password", async () => {
  await assert.rejects(setupManagedInstallation("unused", {}), /Lizenz/);
  await assert.rejects(setupManagedInstallation("unused", { acceptLicenses: true }), /Datenordner/);
  await assert.rejects(
    setupManagedInstallation(path.resolve("app"), { acceptLicenses: true, dataDir: "relative" }),
    /vollständige/,
  );
});

test("Setup-Fragen: „Nur Stats und Tipps“ lädt kein HLAE, FFmpeg nur für Wardogs", () => {
  assert.deepEqual(setupToolNames({}), ["hlae", "ffmpeg"]); // ältere Setups ohne Frage: wie bisher
  assert.deepEqual(setupToolNames({ videoTools: true, games: ["cs2"] }), ["hlae", "ffmpeg"]);
  assert.deepEqual(setupToolNames({ videoTools: false, games: ["cs2"] }), []);
  assert.deepEqual(setupToolNames({ videoTools: false, games: ["cs2", "wardogs"] }), ["ffmpeg"]);
});

test("Setup-Fragen: Spiel-Pakete nur bei der ersten Einrichtung, Ansicht startet das Tutorial", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tecmon-setup-"));
  await applySetupChoices(dir, { games: ["dota2", "valorant", "unbekannt"], ui: "simple" });
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, "games.json"), "utf8")), { installed: { dota2: true } });
  const desktop = JSON.parse(await readFile(path.join(dir, "desktop.json"), "utf8"));
  assert.equal(desktop.ui, "simple");
  assert.equal(desktop.tutorial, 0);
  // Erneutes Setup: Pakete bleiben, wie der Companion sie verwaltet; Ansicht folgt der neuen Antwort.
  await applySetupChoices(dir, { games: ["cs2"], ui: "advanced" });
  assert.deepEqual(JSON.parse(await readFile(path.join(dir, "games.json"), "utf8")), { installed: { dota2: true } });
  assert.equal(JSON.parse(await readFile(path.join(dir, "desktop.json"), "utf8")).ui, "advanced");
  // Ohne Antworten (älteres Setup) bleibt alles, wie es ist.
  const empty = await mkdtemp(path.join(tmpdir(), "tecmon-setup-"));
  await writeFile(path.join(empty, "keep.txt"), "");
  await applySetupChoices(empty, {});
  await assert.rejects(readFile(path.join(empty, "games.json")), /ENOENT/);
  await assert.rejects(readFile(path.join(empty, "desktop.json")), /ENOENT/);
});
