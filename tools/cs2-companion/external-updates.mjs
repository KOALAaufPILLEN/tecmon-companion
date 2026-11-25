import path from "node:path";
import { access, readFile, writeFile, mkdir, rename, rm, readdir, realpath, lstat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { compareVersions, installedHlaeVersion, fetchTool } from "./download-tools.mjs";

const SOURCES = {
  hlae: { repo: "advancedfx/advancedfx", label: "HLAE", executable: "hlae.exe" },
  ffmpeg: { repo: "GyanD/codexffmpeg", label: "FFmpeg", executable: "bin/ffmpeg.exe" },
};
const CHECK_EVERY = 6 * 60 * 60_000;
const RETRY_AFTER = 5 * 60_000;
export const RELEASE_MANAGED = [
  { id: "node", label: "Node.js", channel: "Mit dem automatischen Companion-Update" },
  { id: "plugin", label: "Aufnahme-Plugin und Demo-Rewriter", channel: "Mit dem automatischen Companion-Update; auf die Engine abgestimmt" },
  { id: "translator", label: "Übersetzer, Sprachmodelle und Steam-Downloader", channel: "Versionen mit Companion-Update; fehlende Pakete bei Nutzung mit Prüfsumme" },
  { id: "vcruntime", label: "Microsoft Visual C++ Runtime", channel: "Windows / Companion-Setup; kann Administratorrechte benötigen" },
  { id: "games", label: "Steam / CS2 und Browser-Add-on", channel: "Steam beziehungsweise Browser verwalten diese separat" },
];

/** Nur stabile Original-Releases, exakter Dateiname und GitHub-Asset-Digest. */
export function releaseTool(name, release) {
  const source = SOURCES[name];
  const tag = String(release?.tag_name || "");
  const version = tag.replace(/^v/, "");
  if (!source || release.draft || release.prerelease || !/^\d+\.\d+(?:\.\d+){0,2}$/.test(version))
    throw new Error("Kein gültiges stabiles Hersteller-Release.");
  const filename = name === "hlae" ? `hlae_${version.replaceAll(".", "_")}.zip` : `ffmpeg-${version}-full_build.zip`;
  const url = `https://github.com/${source.repo}/releases/download/${tag}/${filename}`;
  const asset = release.assets?.find((item) => item.name === filename);
  if (asset?.browser_download_url !== url || !/^sha256:[a-f0-9]{64}$/i.test(asset?.digest || "") ||
      !Number.isSafeInteger(asset.size) || asset.size < 1 || asset.size > 300 * 1024 * 1024)
    throw new Error(`${source.label}: Originalpaket mit Hersteller-Prüfsumme fehlt.`);
  return { version, url, file: filename, size: asset.size, sha256: asset.digest.slice(7).toLowerCase() };
}

export async function discoverTool(name, request = fetch) {
  const source = SOURCES[name];
  if (!source) throw new Error("Unbekannte Komponente.");
  const response = await request(`https://api.github.com/repos/${source.repo}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${source.label}: Hersteller-Prüfung fehlgeschlagen (HTTP ${response.status}).`);
  return releaseTool(name, await response.json());
}

export function ffmpegVersion(text) {
  return /^ffmpeg version (\d+\.\d+(?:\.\d+)?)(?:[-\s]|$)/m.exec(String(text))?.[1] || "";
}

async function treeIsSafe(folder) {
  for (const item of await readdir(folder, { withFileTypes: true })) {
    const full = path.join(folder, item.name);
    if ((await lstat(full)).isSymbolicLink()) throw new Error("Tool-Paket enthält einen Link.");
    if (item.isDirectory()) await treeIsSafe(full);
  }
}

/** Nur verwaltete Tool-Ordner. Erst neue Version prüfen, dann mit Rückfall tauschen. */
export async function recoverExternalTools(root) {
  const tools = await realpath(path.join(root, "tools"));
  for (const [name, source] of Object.entries(SOURCES)) {
    const target = path.join(tools, name);
    try { await lstat(target); continue; } catch (error) { if (error.code !== "ENOENT") throw error; }
    const candidates = [];
    for (const entry of await readdir(tools, { withFileTypes: true })) {
      if (!entry.isDirectory() || !new RegExp(`^${name}\\.backup-[a-f0-9-]{36}$`).test(entry.name)) continue;
      const folder = path.join(tools, entry.name);
      const info = await lstat(folder);
      if (info.isSymbolicLink()) continue;
      try { await access(path.join(folder, source.executable)); candidates.push({ folder, time: info.mtimeMs }); } catch { /* unvollständige Sicherung */ }
    }
    candidates.sort((a, b) => b.time - a.time);
    if (candidates[0]) await rename(candidates[0].folder, target);
  }
}

export async function installExternalTool({ root, name, item, run, request = fetch, progress = () => {}, canInstall = async () => true, replace = rename }) {
  const source = SOURCES[name];
  if (!source) throw new Error("Unbekannte Komponente.");
  releaseTool(name, { tag_name: name === "hlae" ? `v${item.version}` : item.version, assets: [{ name: item.file, browser_download_url: item.url, digest: `sha256:${item.sha256}`, size: item.size }] });
  const tools = await realpath(path.join(root, "tools"));
  const target = path.join(tools, name);
  try {
    if (await realpath(target) !== target) throw new Error("Tool-Ordner ist umgeleitet.");
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const { unpacked, cleanup } = await fetchTool(root, name, { ...item, rateBytes: 30_000_000 / 8 }, run, progress, request);
  const backup = path.join(tools, `${name}.backup-${randomUUID()}`);
  let hadOld = false;
  try {
    await treeIsSafe(unpacked);
    let payload = unpacked;
    if (name === "ffmpeg") {
      const entries = await readdir(unpacked, { withFileTypes: true });
      if (entries.length !== 1 || !entries[0].isDirectory()) throw new Error("Unerwartetes FFmpeg-Paket.");
      payload = path.join(unpacked, entries[0].name);
    }
    await access(path.join(payload, source.executable));
    if (name === "hlae") {
      await access(path.join(payload, "x64", "AfxHookSource2.dll"));
      if (await installedHlaeVersion(payload) !== item.version) throw new Error("HLAE-Paket hat eine andere Version.");
    } else {
      const exe = path.join(payload, source.executable);
      const detected = ffmpegVersion(await run(exe, ["-version"], { timeout: 15_000 }));
      if (!detected || compareVersions(detected, item.version) !== 0)
        throw new Error("FFmpeg-Paket hat eine andere Version.");
      // Echter Encoder-/Filtertest, ohne Demo und ohne Ausgabedatei.
      await run(exe, ["-hide_banner", "-v", "error", "-f", "lavfi", "-i", "color=size=32x32:rate=1", "-f", "lavfi", "-i", "anullsrc", "-t", "0.1", "-vf", "scale=32:32,format=yuv420p", "-c:v", "libx264", "-c:a", "aac", "-f", "null", "-"], { timeout: 30_000 });
    }
    if (!await canInstall()) throw new Error("Update zurückgestellt: Aufnahme oder Spiel wurde gestartet.");
    // Beide Pfade sind direkte, feste Kinder des aufgelösten tools-Ordners.
    try { await rename(target, backup); hadOld = true; } catch (error) { if (error.code !== "ENOENT") throw error; }
    try {
      // Gleicher Datenträger: vollständigen geprüften Ordner atomar einsetzen.
      await replace(payload, target);
      await access(path.join(target, source.executable));
    } catch (error) {
      await rm(target, { recursive: true, force: true });
      if (hadOld) await rename(backup, target);
      throw error;
    }
    if (hadOld) await rm(backup, { recursive: true, force: true }).catch(() => {});
    progress(`${source.label} auf ${item.version} aktualisiert.`);
  } finally { await cleanup(); }
}

/** Ein Durchlauf zur Zeit, dauerhafter Status, Fehler erneut versuchen statt „aktuell“. */
export async function createExternalUpdates({ directory, installed, discover = discoverTool, install, blocked = async () => "", prepare = async () => {}, manageMissing = true, now = Date.now }) {
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, "external-updates.json");
  let saved = {};
  try { saved = JSON.parse(await readFile(file, "utf8")); } catch { /* erster Start */ }
  let state = { auto: saved.auto !== false, running: false, checkedAt: 0, nextCheck: 0, message: "Noch nicht geprüft.", tools: [], managed: RELEASE_MANAGED };
  if (Array.isArray(saved.tools)) state.tools = saved.tools.slice(0, 2);
  if (Number.isSafeInteger(saved.checkedAt)) state.checkedAt = saved.checkedAt;
  let flight = null;
  let writing = Promise.resolve();
  const snapshot = () => structuredClone(state);
  const save = () => writing = writing.catch(() => {}).then(async () => {
    const temp = `${file}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(state, null, 2));
    await rename(temp, file);
  });
  return {
    state: snapshot,
    defer(reason) { state.message = `Zurückgestellt: ${reason}`; state.nextCheck = 0; return snapshot(); },
    async setAuto(value) {
      if (typeof value !== "boolean") throw new Error("Ungültige Einstellung.");
      state.auto = value;
      await save();
      return snapshot();
    },
    run({ force = false, progress = () => {} } = {}) {
      if (flight) return flight;
      if (!force && (!state.auto || now() < state.nextCheck)) return Promise.resolve(snapshot());
      flight = (async () => {
        state.running = true;
        state.message = "Externe Komponenten prüfen …";
        try {
          // Auch bei offenem Spiel Versionen ermitteln; ausschließlich die Installation wartet.
          if (!await blocked()) await prepare();
          const tools = [];
          for (const name of Object.keys(SOURCES)) {
            const row = { id: name, label: SOURCES[name].label, installed: "", latest: "", status: "error", message: "" };
            tools.push(row);
            try {
              row.installed = await installed(name);
              if (!manageMissing && !row.installed) {
                row.status = "not-installed";
                row.message = "Nicht installiert. Video-Aufnahme bei Bedarf über die Einrichtung ergänzen.";
                continue;
              }
              const item = await discover(name);
              row.latest = item.version;
              if (row.installed && compareVersions(row.installed, item.version) >= 0) row.status = "current";
              else {
                const reason = await blocked();
                if (reason) { row.status = "pending"; row.message = reason; }
                else {
                  row.status = "updating";
                  state.tools = tools;
                  await install(name, item, progress);
                  row.installed = await installed(name);
                  if (!row.installed || compareVersions(row.installed, item.version) !== 0) throw new Error("Installierte Version stimmt nach dem Update nicht überein.");
                  row.status = "updated";
                }
              }
            } catch (error) { row.status = "error"; row.message = error.message; progress(`${row.label}: ${error.message}`); }
          }
          state.tools = tools;
          state.checkedAt = now();
          const pending = tools.some((t) => ["error", "pending"].includes(t.status));
          state.nextCheck = now() + (pending ? RETRY_AFTER : CHECK_EVERY);
          state.message = pending ? "Prüfung abgeschlossen; offene Komponenten werden erneut versucht."
            : tools.every(t => t.status === "not-installed") ? "Keine Video-Werkzeuge installiert. Bei Bedarf über die Einrichtung ergänzen."
            : "Installierte Hersteller-Komponenten sind aktuell.";
        } catch (error) {
          state.message = `Prüfung fehlgeschlagen: ${error.message}`;
          state.nextCheck = now() + RETRY_AFTER;
        } finally {
          state.running = false;
          await save().catch((error) => { state.message += ` Status konnte nicht gespeichert werden: ${error.message}`; });
        }
        return snapshot();
      })().finally(() => { flight = null; });
      return flight;
    },
  };
}
