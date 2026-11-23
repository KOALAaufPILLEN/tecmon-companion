import path from "node:path";
import net from "node:net";
import { readFile, writeFile, mkdir, access, unlink, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ensureVideoTools } from "./download-tools.mjs";
import { verifyCs2 } from "./cs2-verify.mjs";

export async function readInstallation(root) {
  try {
    const config = JSON.parse(await readFile(path.join(root, "installation.json"), "utf8"));
    return config.format === "tecmon-installation-v1" ? config : null;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function runTool(
  exe,
  args,
  { env = process.env, input, timeout = 120000, detachedStreams = false } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      shell: false,
      windowsHide: true,
      env,
      ...(detachedStreams ? { stdio: "ignore" } : {}),
    });
    let stdout = "",
      stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${path.basename(exe)}: Zeitlimit erreicht.`));
    }, timeout);
    child.stdout?.on("data", (data) => {
      stdout = (stdout + data).slice(-200000);
    });
    child.stderr?.on("data", (data) => {
      stderr = (stderr + data).slice(-10000);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else {
        const error = new Error(`${path.basename(exe)}: ${stderr || stdout || `Code ${code}`}`);
        error.exitCode = code;
        reject(error);
      }
    });
    child.stdin?.on("error", () => {});
    child.stdin?.end(input);
  });
}

export async function availablePort(preferred) {
  if (!Number.isInteger(preferred) || preferred < 1024 || preferred > 65400)
    throw new Error("Ungültiger lokaler Port.");
  for (let port = preferred; port < preferred + 100; port++) {
    const free = await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error("Kein freier lokaler Port gefunden.");
}

/**
 * Einrichtung der Windows-Installation: Ordner, HLAE und FFmpeg. Seit 0.40 ohne
 * CS Demo Manager und ohne PostgreSQL; ein Passwort braucht es nicht mehr.
 * Ältere Installationen behalten ihre Einträge in installation.json.
 */
export async function setupManagedInstallation(root, options, progress = () => {}) {
  if (options.acceptLicenses !== true)
    throw new Error("Bitte die Lizenzhinweise im Setup bestätigen.");
  if (typeof options.dataDir !== "string") throw new Error("Bitte einen Datenordner auswählen.");
  if (!path.isAbsolute(options.dataDir) || !path.isAbsolute(root))
    throw new Error("Bitte vollständige lokale Ordnerpfade auswählen.");
  if (options.dataDir === root || options.dataDir.startsWith(root + path.sep))
    throw new Error("Datenordner muss außerhalb des Programmordners liegen.");
  if (options.cs2Exe) {
    // Nur eine echte cs2.exe von Valve eintragen (Links aufgelöst, Steam-Ordner, Signatur).
    const check = await verifyCs2(options.cs2Exe);
    if (!check.ok) throw new Error(`Gewählte cs2.exe abgelehnt: ${check.reason}`);
    options = { ...options, cs2Exe: check.path };
  }
  const privateDir = path.join(options.dataDir, "TecMon-Private");
  const configFile = path.join(root, "installation.json");
  let previous = await readInstallation(root);
  const pendingFile = path.join(root, "installation.pending.json");
  if (!previous)
    try {
      previous = JSON.parse(await readFile(pendingFile, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  if (previous && previous.dataDir !== options.dataDir)
    throw new Error(
      "Bei einer bestehenden Installation bitte den bisherigen Datenordner verwenden.",
    );
  const config = previous || {
    format: "tecmon-installation-v1",
    version: "0.48.2",
    installationId: randomUUID(),
    dataDir: options.dataDir,
    profileDir: path.join(privateDir, "csdm-user"),
    hlaeExe: path.join(root, "tools", "hlae", "hlae.exe"),
    ffmpegExe: path.join(root, "tools", "ffmpeg", "bin", "ffmpeg.exe"),
    outputDir: path.join(options.dataDir, "Videos"),
    cs2Exe: options.cs2Exe || "",
  };
  if (!config.installationId) config.installationId = randomUUID();
  await ensureVideoTools(root, runTool, progress);
  for (const exe of [config.hlaeExe, config.ffmpegExe]) await access(exe);
  try {
    const entries = await readdir(privateDir);
    if (entries.length && !entries.includes("tecmon-data.marker"))
      throw new Error(
        "Der private Datenordner enthält fremde Dateien. Bitte einen anderen Datenordner auswählen.",
      );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await mkdir(privateDir, { recursive: true });
  await writeFile(path.join(privateDir, "tecmon-data.marker"), "TecMon private data v1\n");
  progress("Privaten Datenordner vorbereiten …");
  await runTool(path.join(root, "TecMon Companion.exe"), ["--private", privateDir]);
  await writeFile(pendingFile, JSON.stringify(config, null, 2));
  for (const dir of [config.profileDir, config.outputDir, path.join(privateDir, "hlae-config")])
    await mkdir(dir, { recursive: true });
  if (options.cs2Exe) config.cs2Exe = options.cs2Exe;
  if (typeof options.demoDir === "string" && path.isAbsolute(options.demoDir)) config.demoDir = options.demoDir;
  progress("Videotools testen …");
  await runTool(config.ffmpegExe, ["-version"]);
  await writeFile(configFile, JSON.stringify(config, null, 2));
  await unlink(pendingFile).catch(() => {});
  progress("Einrichtung abgeschlossen.");
  return config;
}
