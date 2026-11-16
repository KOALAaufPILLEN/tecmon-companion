/**
 * Ist die eingetragene cs2.exe wirklich CS2 von Valve?
 *
 * Eine feste Prüfsumme der cs2.exe bricht bei jedem CS2-Update. Darum prüft der
 * Companion, was hinter dem Pfad wirklich liegt:
 *   1. Verknüpfungen auflösen: symbolische Links, Junctions und umgeleitete
 *      Ordner werden zum echten Pfad aufgelöst; nur dieser wird weiter geprüft
 *      und später gestartet.
 *   2. Kein Hardlink: Eine Datei mit mehreren Namen (`nlink > 1`) wird abgelehnt.
 *   3. Echtes Programm: Windows-PE-Datei (Kopf `MZ`), Name `cs2.exe`.
 *   4. Steam-Ordner: `…\steamapps\common\Counter-Strike Global Offensive\game\bin\win64\cs2.exe`,
 *      und in `steamapps` liegt das Steam-Manifest `appmanifest_730.acf`.
 *   5. Windows: gültige Authenticode-Signatur mit Valve als Herausgeber
 *      (`Get-AuthenticodeSignature`). Eine umbenannte Browser-exe trägt die
 *      Signatur ihres eigenen Herstellers oder gar keine und fällt hier durch.
 *
 * Das schützt vor Verwechslung und untergeschobenen Programmen. Gegen den
 * Besitzer des PCs selbst ist es kein vollständiger Manipulationsschutz.
 */
import path from "node:path";
import { execFile } from "node:child_process";
import { lstat, stat, realpath, open, access } from "node:fs/promises";

export const CS2_APP_ID = 730;
const TAIL = ["steamapps", "common", "counter-strike global offensive", "game", "bin", "win64", "cs2.exe"];
/** Organisation im Signatur-Zertifikat (Subject `O=`), z. B. `O=Valve Corp.`. */
export const VALVE_SIGNER = /(?:^|,\s*)O="?Valve(?: Corp(?:oration)?\.?)?"?\s*(?:,|$)/i;

const fail = (reason) => ({ ok: false, reason, path: "" });

/** Liegt der (echte) Pfad im CS2-Ordner einer Steam-Bibliothek? Gibt den steamapps-Ordner zurück. */
export function steamappsOf(file) {
  const list = String(file)
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((p) => p.toLowerCase());
  if (list.length < TAIL.length + 1) return "";
  const tail = list.slice(-TAIL.length);
  if (tail.some((p, i) => p !== TAIL[i])) return "";
  return path.resolve(path.dirname(file), "..", "..", "..", "..", "..");
}

/** Authenticode-Signatur unter Windows lesen; der Pfad geht als Umgebungsvariable, nie in den Befehl. */
export function authenticode(file, timeout = 20000) {
  const script =
    "$s=Get-AuthenticodeSignature -LiteralPath $env:TECMON_CHECK_FILE;" +
    "[pscustomobject]@{status=[string]$s.Status;subject=[string]$s.SignerCertificate.Subject}|ConvertTo-Json -Compress";
  return new Promise((resolve) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
      { windowsHide: true, timeout, env: { ...process.env, TECMON_CHECK_FILE: file } },
      (error, stdout) => {
        if (error) return resolve({ status: "Error", subject: "" });
        try {
          const value = JSON.parse(String(stdout).trim());
          resolve({ status: String(value.status || ""), subject: String(value.subject || "") });
        } catch {
          resolve({ status: "Error", subject: "" });
        }
      },
    );
  });
}

/**
 * Prüft eine cs2.exe. Ergebnis `{ ok, reason, path }`; `path` ist der echte,
 * aufgelöste Pfad, der danach statt der Eingabe benutzt wird.
 * `signature` ersetzt die Authenticode-Abfrage (Tests); `platform` steuert,
 * ob sie läuft (nur unter Windows).
 */
export async function checkCs2Exe(file, { platform = process.platform, signature = authenticode } = {}) {
  if (!file || typeof file !== "string" || !path.isAbsolute(file)) return fail("Kein vollständiger Pfad zur cs2.exe.");
  if (path.basename(file).toLowerCase() !== "cs2.exe") return fail("Die Datei heißt nicht cs2.exe.");
  let real;
  try {
    real = await realpath(file);
  } catch {
    return fail("cs2.exe wurde nicht gefunden.");
  }
  if (path.basename(real).toLowerCase() !== "cs2.exe")
    return fail("cs2.exe ist eine Verknüpfung auf ein anderes Programm.");
  const link = await lstat(real).catch(() => null);
  if (!link || link.isSymbolicLink() || !link.isFile()) return fail("cs2.exe ist keine normale Datei.");
  const info = await stat(real);
  if (info.nlink > 1) return fail("cs2.exe ist ein Hardlink auf eine andere Datei.");
  const handle = await open(real, "r");
  try {
    const head = Buffer.alloc(2);
    await handle.read(head, 0, 2, 0);
    if (head.toString("latin1") !== "MZ") return fail("cs2.exe ist kein Windows-Programm.");
  } finally {
    await handle.close();
  }
  const steamapps = steamappsOf(real);
  if (!steamapps) return fail("cs2.exe liegt nicht im CS2-Ordner einer Steam-Bibliothek.");
  try {
    await access(path.join(steamapps, `appmanifest_${CS2_APP_ID}.acf`));
  } catch {
    return fail("Zur cs2.exe gehört kein Steam-Manifest (appmanifest_730.acf).");
  }
  if (platform === "win32") {
    // Bewusst ohne Zwischenspeicher: Größe und Änderungszeit lassen sich fälschen, und geprüft wird selten.
    const result = await signature(real);
    if (result.status === "Error") return fail("Die Signatur der cs2.exe ließ sich nicht prüfen.");
    if (result.status !== "Valid") return fail("cs2.exe hat keine gültige digitale Signatur.");
    if (!VALVE_SIGNER.test(result.subject)) return fail("cs2.exe ist nicht von Valve signiert.");
  }
  return { ok: true, reason: "", path: real };
}

/** Standard für Companion und Aufnahme: echte Prüfung unter Windows, sonst (Entwicklung, Tests) nur „vorhanden?“. */
export const verifyCs2 =
  process.platform === "win32"
    ? (file) => checkCs2Exe(file)
    : async (file) => ({ ok: !!file, reason: file ? "" : "cs2.exe wurde nicht gefunden.", path: file || "" });
