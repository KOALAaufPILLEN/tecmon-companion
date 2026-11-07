import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
const exec = promisify(execFile);

/** Tool discovery and pg_isready do not read passwords or modify existing clusters. */
export async function checkPostgres({
  port = 5432,
  roots = [path.join(process.env.ProgramFiles || "C:\\Program Files", "PostgreSQL")],
  searchPath = process.env.PATH || "",
  run = exec,
  exists = existsSync,
} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Ungültiger Datenbank-Port.");
  const bins = [];
  for (const root of roots) {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries
        .filter((e) => e.isDirectory() && /^\d+$/.test(e.name))
        .sort((a, b) => Number(b.name) - Number(a.name)))
        bins.push(path.join(root, entry.name, "bin"));
    } catch {
      /* An installation may live on PATH instead. */
    }
  }
  if (process.env.PGBIN) bins.push(process.env.PGBIN);
  bins.push(...searchPath.split(path.delimiter).filter(Boolean));
  let found = null;
  for (const bin of new Set(bins)) {
    const psql = path.join(bin, "psql.exe");
    if (!exists(psql)) continue;
    try {
      const { stdout } = await run(psql, ["--version"], {
        windowsHide: true,
        timeout: 3000,
        maxBuffer: 2048,
      });
      const match = stdout.match(/^psql \(PostgreSQL\) (\d+)(?:\.\d+)*/);
      if (!match) continue;
      const major = Number(match[1]);
      const candidate = {
        installed: true,
        supported: major >= 17,
        major,
        bin,
        version: match[0].replace("psql (PostgreSQL) ", ""),
        ready: false,
        probeAvailable: exists(path.join(bin, "pg_isready.exe")),
        port,
      };
      if (!found || candidate.major > found.major) found = candidate;
    } catch {
      /* Ignore broken or inaccessible executables. */
    }
  }
  if (!found)
    return { installed: false, supported: false, ready: false, probeAvailable: false, port };
  if (found.probeAvailable) {
    try {
      await run(
        path.join(found.bin, "pg_isready.exe"),
        ["-q", "-h", "127.0.0.1", "-p", String(port), "-t", "2"],
        { windowsHide: true, timeout: 3500, maxBuffer: 2048 },
      );
      found.ready = true;
    } catch {
      /* Not responding or still starting; never treat as a reason to reinstall. */
    }
  }
  return found;
}

export function postgresEnvironment(postgres, base = process.env) {
  if (!postgres?.supported || !postgres.bin) return base;
  const result = { ...base };
  const previous = Object.entries(base).find(([key]) => key.toLowerCase() === "path")?.[1] || "";
  for (const key of Object.keys(result)) if (key.toLowerCase() === "path") delete result[key];
  result.PATH = `${postgres.bin}${path.delimiter}${previous}`;
  return result;
}

export async function installPostgres({
  check = checkPostgres,
  launch = spawn,
  platform = process.platform,
} = {}) {
  const postgres = await check();
  if (postgres.supported)
    return {
      skipped: true,
      message: `PostgreSQL ${postgres.version} ist bereits installiert. Dienst und Verbindung in CS Demo Manager prüfen.`,
    };
  if (platform !== "win32") throw new Error("Dieser Installationsassistent ist für Windows.");
  // Arguments are fixed. WinGet verifies its package hash; installer, UAC and agreements stay interactive.
  const child = launch(
    "winget.exe",
    [
      "install",
      "--id",
      "PostgreSQL.PostgreSQL.18",
      "--exact",
      "--source",
      "winget",
      "--interactive",
      "--no-upgrade",
    ],
    { shell: false, stdio: "inherit" },
  );
  return await new Promise((resolve, reject) => {
    child.once("error", () =>
      reject(
        new Error(
          "WinGet nicht verfügbar. Offiziellen Installer von https://www.postgresql.org/download/windows/ verwenden.",
        ),
      ),
    );
    child.once("close", (code) =>
      code === 0
        ? resolve({
            skipped: false,
            message:
              "Installation beendet. Im Companion erneut prüfen und anschließend CS Demo Manager verbinden.",
          })
        : reject(
            new Error(
              `Installation abgebrochen oder fehlgeschlagen (Code ${code}). Bestehende Datenbanken wurden vom Companion nicht verändert.`,
            ),
          ),
    );
  });
}
