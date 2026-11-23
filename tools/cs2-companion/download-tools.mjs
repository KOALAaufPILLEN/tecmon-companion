import path from "node:path";
import { createWriteStream, createReadStream } from "node:fs";
import { access, readFile, mkdir, readdir, cp, unlink, rename, rm } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { unpackCommand } from "./powershell.mjs";

const readManifest = async (root) => JSON.parse(await readFile(path.join(root, "dependency-manifest.json"), "utf8"));

/**
 * Ein Paket aus dem Manifest vom Originalanbieter laden, SHA256 prüfen und in
 * einen frischen Ordner entpacken. Gibt den Ordner zurück; `cleanup()` räumt auf.
 */
async function fetchTool(root, name, item, run, progress, fetchImpl = fetch) {
  if (!item || !item.url.startsWith("https://github.com/") || !/^[a-f0-9]{64}$/i.test(item.sha256)) throw new Error("Ungültiges Tool-Manifest.");
  progress(`${name.toUpperCase()} vom Originalanbieter herunterladen und SHA256 prüfen …`);
  const temporary = path.join(root, "tool-downloads", randomUUID());
  await mkdir(temporary, { recursive: true });
  const zip = path.join(temporary, "package.zip");
  const unpacked = path.join(temporary, "unpacked");
  const cleanup = () => rm(temporary, { recursive: true, force: true }).catch(() => {});
  try {
    const response = await fetchImpl(item.url, { signal: AbortSignal.timeout(15 * 60 * 1000) });
    if (!response.ok || !response.body) throw new Error(`${name}: Download fehlgeschlagen (${response.status}).`);
    let bytes = 0;
    const limit = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > 300 * 1024 * 1024 ? new Error("Tool-Download zu groß.") : null, chunk);
    }});
    await pipeline(Readable.fromWeb(response.body), limit, createWriteStream(zip, { flags: "wx" }));
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(zip)) hash.update(chunk);
    if (hash.digest("hex").toLowerCase() !== item.sha256.toLowerCase()) throw new Error(`${name}: SHA256 stimmt nicht überein. Download wird nicht verwendet.`);
    // Ohne .ps1-Datei: gesperrte Skriptausführung (Execution Policy) darf die Einrichtung nicht abbrechen.
    const unpack = unpackCommand(zip, unpacked);
    await run("powershell.exe", unpack.args, { env: unpack.env, timeout: 120000 });
    await unlink(zip).catch(() => {});
    return { unpacked, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

/** Public installer fetches these unmodified packages from their original publisher. */
export async function ensureVideoTools(root, run, progress) {
  const manifest = await readManifest(root);
  for (const [name, expected] of [["hlae", path.join("hlae", "hlae.exe")], ["ffmpeg", path.join("ffmpeg", "bin", "ffmpeg.exe")]]) {
    try { await access(path.join(root, "tools", expected)); continue; } catch { /* First install. */ }
    const { unpacked, cleanup } = await fetchTool(root, name, manifest[name], run, progress);
    try {
      const target = path.join(root, "tools", name);
      if (name === "hlae") await cp(unpacked, target, { recursive: true });
      else {
        const folders = (await readdir(unpacked, { withFileTypes: true })).filter((f) => f.isDirectory());
        if (folders.length !== 1) throw new Error("Unerwartetes FFmpeg-Paket.");
        await cp(path.join(unpacked, folders[0].name), target, { recursive: true });
      }
      await access(path.join(root, "tools", expected));
    } finally { await cleanup(); }
  }
}

/** Erste HLAE-Version aus changelog.xml (neueste steht oben); "" = unbekannt. */
export function hlaeVersion(changelog) {
  const match = /<release>\s*<name>HLAE<\/name>\s*<version>(\d+(?:\.\d+){1,3})<\/version>/.exec(String(changelog || ""));
  return match ? match[1] : "";
}

/** Vergleicht "2.193.1" mit "2.193.0"; negativ = a älter. */
export function compareVersions(a, b) {
  const x = a.split(".").map(Number), y = b.split(".").map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] || 0) - (y[i] || 0);
    if (d) return d;
  }
  return 0;
}

export async function installedHlaeVersion(hlaeDir) {
  try { return hlaeVersion(await readFile(path.join(hlaeDir, "changelog.xml"), "utf8")); } catch { return ""; }
}

/**
 * HLAE bei bestehenden Installationen auf die Version aus dem Manifest bringen.
 * ensureVideoTools() lädt HLAE nur bei der Ersteinrichtung; nach einem CS2-Update
 * bricht eine alte AfxHookSource2 aber mit „Problem in …ViewModel.cpp“ ab. Nur
 * älter oder unbekannt wird ersetzt, eine neuere Version bleibt. Nie während
 * CS2/HLAE laufen aufrufen (Dateien wären gesperrt).
 */
export async function updateHlae({ root, hlaeExe, run, progress = () => {}, fetchImpl }) {
  let manifest;
  try { manifest = await readManifest(root); } catch { return { updated: false, reason: "no-manifest" }; }
  const item = manifest.hlae;
  if (!item?.version) return { updated: false, reason: "no-manifest" };
  const dir = path.dirname(hlaeExe);
  const installed = await installedHlaeVersion(dir);
  if (installed && compareVersions(installed, item.version) >= 0) return { updated: false, installed };
  const { unpacked, cleanup } = await fetchTool(root, "hlae", item, run, progress, fetchImpl);
  const backup = `${dir}.alt-${randomUUID()}`;
  try {
    await access(path.join(unpacked, path.basename(hlaeExe))).catch(() => access(path.join(unpacked, "HLAE.exe")));
    await rename(dir, backup);
    try {
      await cp(unpacked, dir, { recursive: true });
      await access(hlaeExe);
    } catch (error) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
      await rename(backup, dir);
      throw error;
    }
    await rm(backup, { recursive: true, force: true }).catch(() => {});
    progress(`HLAE von ${installed || "unbekannt"} auf ${item.version} aktualisiert.`);
    return { updated: true, installed, version: item.version };
  } finally { await cleanup(); }
}
