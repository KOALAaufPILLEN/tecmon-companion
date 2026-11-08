#!/usr/bin/env node
/**
 * Versionsnummer des Companions an einer Stelle pflegen.
 *
 *   node scripts/version.mjs check        prüft, dass alle Dateien package.json entsprechen
 *   node scripts/version.mjs set 0.11.0   setzt die neue Version in allen Dateien
 *
 * Der Release-Workflow veröffentlicht automatisch, sobald auf main eine Version
 * liegt, zu der es noch kein Tag gibt.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SEMVER = /^\d+\.\d+\.\d+$/;
const V = String.raw`\d+\.\d+\.\d+`;

/** Datei, Muster mit genau einer Versions-Gruppe, erwartete Trefferzahl. */
export const LOCATIONS = [
  ["tools/cs2-companion/updater.mjs", new RegExp(`(export const VERSION = ")(${V})(")`, "g"), 1],
  ["tools/cs2-companion/public/index.html", new RegExp(`(WINDOWS · PREVIEW )(${V})()`, "g"), 1],
  ["tools/cs2-companion/managed-installation.mjs", new RegExp(`(\\bversion: ")(${V})(")`, "g"), 1],
  ["tools/cs2-companion/windows/TecMon.cs", new RegExp(`(version=")(${V})(")`, "g"), 1],
  ["tools/cs2-companion/windows/TecMon.cs", new RegExp(`("DisplayVersion", ?")(${V})(")`, "g"), 2],
  ["tools/cs2-companion/windows/TecMon.cs", new RegExp(`(TecMon Companion auf )(${V})( aktualisieren)`, "g"), 1],
];

const read = (file) => readFileSync(path.join(root, file), "utf8");
const write = (file, text) => writeFileSync(path.join(root, file), text);

export function packageVersion() {
  return JSON.parse(read("package.json")).version;
}

export function findMismatches(expected = packageVersion()) {
  const problems = [];
  if (!SEMVER.test(expected)) problems.push(`package.json: ungültige Version ${expected}`);
  const lock = JSON.parse(read("package-lock.json"));
  if (lock.version !== expected || lock.packages?.[""]?.version !== expected)
    problems.push(`package-lock.json: ${lock.version} statt ${expected}`);
  for (const [file, pattern, count] of LOCATIONS) {
    const found = [...read(file).matchAll(pattern)].map((m) => m[2]);
    if (found.length !== count) problems.push(`${file}: ${found.length} statt ${count} Fundstellen für ${pattern}`);
    for (const v of found) if (v !== expected) problems.push(`${file}: ${v} statt ${expected}`);
  }
  return problems;
}

function setVersion(next) {
  if (!SEMVER.test(next)) throw new Error(`Ungültige Version: ${next}`);
  const pkg = JSON.parse(read("package.json"));
  pkg.version = next;
  write("package.json", JSON.stringify(pkg, null, 2) + "\n");
  const lock = JSON.parse(read("package-lock.json"));
  lock.version = next;
  if (lock.packages?.[""]) lock.packages[""].version = next;
  write("package-lock.json", JSON.stringify(lock, null, 2) + "\n");
  for (const [file, pattern] of LOCATIONS) write(file, read(file).replace(pattern, (_m, a, _v, b) => a + next + b));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, arg] = process.argv.slice(2);
  if (command === "set") {
    setVersion(arg);
    console.log(`Version auf ${arg} gesetzt.`);
  } else if (command !== "check") {
    console.error("Aufruf: node scripts/version.mjs check | set <x.y.z>");
    process.exit(2);
  }
  const problems = findMismatches();
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  if (command === "check") console.log(packageVersion());
}
