/**
 * Radarbilder für die Rundentipps. Sie werden nie mitgeliefert oder
 * heruntergeladen: Der Companion kopiert sie nur aus einem CS-Demo-Manager-Ordner,
 * der schon auf dem PC liegt (alte Companion-Installation oder eigenes Programm),
 * in seinen eigenen Ordner. Fehlt ein Bild, zeigen die Tipps nur Text.
 */
import path from "node:path";
import { existsSync } from "node:fs";
import { copyFile, lstat, mkdir, readdir } from "node:fs/promises";

const MAP = /^de_[a-z0-9_]+$/;
const MAX_BYTES = 8 * 1024 * 1024;
const RADAR_SUBDIR = ["resources", "static", "images", "maps", "cs2", "radars"];

/** Fehlende Radarbilder aus den Quellordnern kopieren; vorhandene bleiben unverändert. */
export async function copyRadars(target, sources) {
  let copied = 0;
  for (const source of sources) {
    if (!source) continue;
    const folder = path.join(source, ...RADAR_SUBDIR);
    let entries;
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const name = entry.name.toLowerCase();
      if (!entry.isFile() || !name.endsWith(".png") || !MAP.test(name.slice(0, -4))) continue;
      const destination = path.join(target, name);
      if (existsSync(destination)) continue;
      const info = await lstat(path.join(folder, entry.name)).catch(() => null);
      if (!info?.isFile() || info.size > MAX_BYTES) continue;
      await mkdir(target, { recursive: true });
      await copyFile(path.join(folder, entry.name), destination);
      copied++;
    }
  }
  return copied;
}

/** Pfad zum Radarbild einer Map im eigenen Ordner, sonst "". */
export function radarFile(dir, map) {
  if (typeof map !== "string" || !MAP.test(map)) return "";
  const file = path.join(dir, `${map}.png`);
  return existsSync(file) ? file : "";
}
