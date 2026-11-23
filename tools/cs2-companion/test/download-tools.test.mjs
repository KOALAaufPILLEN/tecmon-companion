import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { compareVersions, hlaeVersion, installedHlaeVersion, updateHlae } from "../download-tools.mjs";

const changelog = (v) =>
  `<?xml version="1.0"?>\n<changelog>\n\n<release>\n<name>HLAE</name>\n<version>${v}</version>\n<time>x</time>\n</release>\n\n<release>\n<name>HLAE</name>\n<version>2.1.0</version>\n</release>\n</changelog>`;

test("HLAE-Version aus changelog.xml lesen und vergleichen", () => {
  assert.equal(hlaeVersion(changelog("2.193.1")), "2.193.1");
  assert.equal(hlaeVersion("kaputt"), "");
  assert.ok(compareVersions("2.193.0", "2.193.1") < 0);
  assert.ok(compareVersions("2.194.0", "2.193.1") > 0);
  assert.equal(compareVersions("2.193.1", "2.193.1"), 0);
});

test("Ausgeliefertes Manifest zeigt auf HLAE mit CS2-1.42-Anpassung", async () => {
  const manifest = JSON.parse(await readFile(new URL("../windows/dependency-manifest.json", import.meta.url), "utf8"));
  assert.ok(compareVersions(manifest.hlae.version, "2.193.1") >= 0);
  assert.ok(manifest.hlae.url.includes(`v${manifest.hlae.version}/hlae_${manifest.hlae.version.replaceAll(".", "_")}.zip`));
  assert.match(manifest.hlae.sha256, /^[a-f0-9]{64}$/);
});

async function setup(t, installed, zip = Buffer.from("hlae-zip")) {
  const root = await mkdtemp(path.join(os.tmpdir(), "tecmon-hlae-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dir = path.join(root, "tools", "hlae");
  await mkdir(path.join(dir, "x64"), { recursive: true });
  await writeFile(path.join(dir, "hlae.exe"), "alt");
  await writeFile(path.join(dir, "x64", "AfxHookSource2.dll"), "alt");
  if (installed) await writeFile(path.join(dir, "changelog.xml"), changelog(installed));
  const sha256 = createHash("sha256").update(zip).digest("hex");
  await writeFile(path.join(root, "dependency-manifest.json"), JSON.stringify({
    hlae: { version: "2.193.1", file: "hlae.zip", url: "https://github.com/advancedfx/advancedfx/releases/download/v2.193.1/hlae_2_193_1.zip", sha256 },
  }));
  const fetched = [];
  const fetchImpl = async (url) => {
    fetched.push(url);
    return new Response(zip);
  };
  // Ersatz für unpack-tools.ps1: legt die neue HLAE-Version an.
  const run = async (_exe, args) => {
    const target = args[args.indexOf("-Destination") + 1];
    await mkdir(path.join(target, "x64"), { recursive: true });
    await writeFile(path.join(target, "hlae.exe"), "neu");
    await writeFile(path.join(target, "x64", "AfxHookSource2.dll"), "neu");
    await writeFile(path.join(target, "changelog.xml"), changelog("2.193.1"));
  };
  return { root, dir, hlaeExe: path.join(dir, "hlae.exe"), fetched, fetchImpl, run };
}

test("veraltete HLAE wird bei bestehender Installation ersetzt", async (t) => {
  const s = await setup(t, "2.193.0");
  const result = await updateHlae({ root: s.root, hlaeExe: s.hlaeExe, run: s.run, fetchImpl: s.fetchImpl });
  assert.deepEqual(result, { updated: true, installed: "2.193.0", version: "2.193.1" });
  assert.equal(await readFile(path.join(s.dir, "x64", "AfxHookSource2.dll"), "utf8"), "neu");
  assert.equal(await installedHlaeVersion(s.dir), "2.193.1");
  // Keine Sicherung und kein Download-Rest bleiben liegen.
  assert.deepEqual((await readdir(path.join(s.root, "tools"))).sort(), ["hlae"]);
  assert.deepEqual(await readdir(path.join(s.root, "tool-downloads")), []);
});

test("aktuelle oder neuere HLAE wird nicht angefasst", async (t) => {
  for (const v of ["2.193.1", "2.194.0"]) {
    const s = await setup(t, v);
    const result = await updateHlae({ root: s.root, hlaeExe: s.hlaeExe, run: s.run, fetchImpl: s.fetchImpl });
    assert.equal(result.updated, false);
    assert.deepEqual(s.fetched, []);
    assert.equal(await readFile(s.hlaeExe, "utf8"), "alt");
  }
});

test("falsche Prüfsumme: alte HLAE bleibt unverändert", async (t) => {
  const s = await setup(t, "2.193.0");
  const manifest = JSON.parse(await readFile(path.join(s.root, "dependency-manifest.json"), "utf8"));
  manifest.hlae.sha256 = "0".repeat(64);
  await writeFile(path.join(s.root, "dependency-manifest.json"), JSON.stringify(manifest));
  await assert.rejects(updateHlae({ root: s.root, hlaeExe: s.hlaeExe, run: s.run, fetchImpl: s.fetchImpl }), /SHA256/);
  assert.equal(await readFile(s.hlaeExe, "utf8"), "alt");
  assert.equal(await installedHlaeVersion(s.dir), "2.193.0");
});

test("ohne Manifest (Entwicklungsordner) kein Download", async (t) => {
  const s = await setup(t, "");
  await rm(path.join(s.root, "dependency-manifest.json"));
  assert.deepEqual(await updateHlae({ root: s.root, hlaeExe: s.hlaeExe, run: s.run, fetchImpl: s.fetchImpl }), { updated: false, reason: "no-manifest" });
  assert.deepEqual(s.fetched, []);
});
