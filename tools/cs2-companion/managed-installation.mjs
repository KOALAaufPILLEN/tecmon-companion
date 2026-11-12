import path from "node:path";
import net from "node:net";
import { readFile, writeFile, mkdir, access, unlink, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { ensureVideoTools } from "./download-tools.mjs";

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

export function managedEnvironment(config, base = process.env) {
  const env = { ...base };
  const oldPath = Object.entries(env).find(([k]) => k.toLowerCase() === "path")?.[1] || "";
  for (const k of Object.keys(env)) if (k.toLowerCase() === "path") delete env[k];
  return {
    ...env,
    PATH: `${config.postgresBin}${path.delimiter}${oldPath}`,
    USERPROFILE: config.profileDir,
    HOME: config.profileDir,
    CSDM_WS_PORT: String(config.csdmPort),
    APPDATA: path.join(config.profileDir, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(config.profileDir, "AppData", "Local"),
  };
}

export function csdmInvocation(exe, args, config) {
  const electron = path.basename(exe).toLowerCase() === "cs-demo-manager.exe";
  return {
    exe,
    args: electron
      ? [path.join(path.dirname(exe), "resources", "app.asar", "cli.js"), ...args]
      : args,
    env: {
      ...(config ? managedEnvironment(config) : process.env),
      ...(electron ? { ELECTRON_RUN_AS_NODE: "1" } : {}),
    },
  };
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

export async function ensureManagedDatabase(config) {
  const ctl = path.join(config.postgresBin, "pg_ctl.exe");
  try {
    await runTool(ctl, ["status", "-D", config.clusterDir]);
    return;
  } catch {
    /* Not running yet. */
  }
  await runTool(
    ctl,
    [
      "start",
      "-D",
      config.clusterDir,
      "-l",
      path.join(path.dirname(config.clusterDir), "postgresql.log"),
      "-w",
      "-t",
      "45",
    ],
    { timeout: 55000, detachedStreams: true },
  );
}

export async function stopManagedDatabase(config, run = runTool) {
  try {
    await run(path.join(config.postgresBin, "pg_ctl.exe"), ["status", "-D", config.clusterDir]);
  } catch (error) {
    if (error.exitCode === 3) return;
    throw error;
  }
  await run(
    path.join(config.postgresBin, "pg_ctl.exe"),
    ["stop", "-D", config.clusterDir, "-m", "fast", "-w", "-t", "30"],
    { timeout: 35000 },
  );
}

export async function setupManagedInstallation(root, options, progress = () => {}) {
  if (options.acceptLicenses !== true)
    throw new Error("Bitte die Lizenzhinweise im Setup bestätigen.");
  if (
    typeof options.password !== "string" ||
    options.password.length < 8 ||
    /[\r\n\0]/.test(options.password)
  )
    throw new Error(
      "Bitte ein frei gewähltes Passwort mit mindestens 8 Zeichen ohne Zeilenumbruch eingeben.",
    );
  if (!path.isAbsolute(options.dataDir) || !path.isAbsolute(root))
    throw new Error("Bitte vollständige lokale Ordnerpfade auswählen.");
  if (options.dataDir === root || options.dataDir.startsWith(root + path.sep))
    throw new Error("Datenordner muss außerhalb des Programmordners liegen.");
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
    version: "0.17.3",
    installationId: randomUUID(),
    dataDir: options.dataDir,
    clusterDir: path.join(privateDir, "postgres", "data"),
    profileDir: path.join(privateDir, "csdm-user"),
    postgresBin: path.join(root, "tools", "postgresql", "bin"),
    csdmExe: path.join(root, "tools", "csdm", "cs-demo-manager.exe"),
    hlaeExe: path.join(root, "tools", "hlae", "hlae.exe"),
    ffmpegExe: path.join(root, "tools", "ffmpeg", "bin", "ffmpeg.exe"),
    outputDir: path.join(options.dataDir, "Videos"),
    port: await availablePort(options.databasePort ?? 25433),
    csdmPort: await availablePort(25474),
    cs2Exe: options.cs2Exe || "",
  };
  if (!config.installationId) config.installationId = randomUUID();
  await ensureVideoTools(root, runTool, progress);
  for (const exe of [
    config.csdmExe,
    config.hlaeExe,
    config.ffmpegExe,
    path.join(config.postgresBin, "initdb.exe"),
  ])
    await access(exe);
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
  progress("Private Datenbankordner vorbereiten …");
  await runTool(path.join(root, "TecMon Companion.exe"), ["--private", privateDir]);
  await writeFile(pendingFile, JSON.stringify(config, null, 2));
  for (const dir of [
    config.profileDir,
    config.outputDir,
    path.join(privateDir, "hlae-config"),
    path.join(config.profileDir, ".csdm"),
    path.join(config.profileDir, "AppData", "Roaming"),
    path.join(config.profileDir, "AppData", "Local"),
  ])
    await mkdir(dir, { recursive: true });
  const settingsFile = path.join(config.profileDir, ".csdm", "settings.json");
  let appPassword;
  const bootstrapSecret = path.join(privateDir, "application-password.tmp");
  let fresh = false;
  try {
    await access(path.join(config.clusterDir, "PG_VERSION"));
  } catch {
    fresh = true;
  }
  if (fresh) {
    const passwordFile = path.join(privateDir, "init-password.tmp");
    await writeFile(passwordFile, options.password, { mode: 0o600, flag: "wx" });
    progress("PostgreSQL initialisieren – mit deinem gewählten Administratorpasswort …");
    try {
      await runTool(path.join(config.postgresBin, "initdb.exe"), [
        "-D",
        config.clusterDir,
        "-U",
        "tecmon_admin",
        "--pwfile",
        passwordFile,
        "--auth-host=scram-sha-256",
        "--auth-local=scram-sha-256",
        "--encoding=UTF8",
        "--locale=C",
      ]);
    } finally {
      await unlink(passwordFile).catch(() => {});
    }
  }
  await writeFile(
    path.join(config.clusterDir, "tecmon.conf"),
    `listen_addresses = '127.0.0.1'\nport = ${config.port}\npassword_encryption = 'scram-sha-256'\n`,
    "utf8",
  );
  const pgConfig = path.join(config.clusterDir, "postgresql.conf");
  const pgText = await readFile(pgConfig, "utf8");
  if (!pgText.includes("include = 'tecmon.conf'"))
    await writeFile(pgConfig, pgText + "\ninclude = 'tecmon.conf'\n", "utf8");
  progress("Lokalen Datenbankserver starten …");
  await ensureManagedDatabase(config);
  const psql = path.join(config.postgresBin, "psql.exe");
  const args = [
    "-X",
    "-w",
    "-h",
    "127.0.0.1",
    "-p",
    String(config.port),
    "-U",
    "tecmon_admin",
    "-d",
    "postgres",
    "-v",
    "ON_ERROR_STOP=1",
  ];
  try {
    let hasSettings = true;
    try {
      await access(settingsFile);
    } catch {
      hasSettings = false;
    }
    if (!hasSettings) {
      try {
        appPassword = await readFile(bootstrapSecret, "utf8");
      } catch {
        const { randomBytes } = await import("node:crypto");
        appPassword = randomBytes(32).toString("hex");
        await writeFile(bootstrapSecret, appPassword, { mode: 0o600 });
      }
      if (!/^[0-9a-f]{64}$/.test(appPassword))
        throw new Error("Ungültiger interner Einrichtungsschlüssel.");
    } else {
      const existing = JSON.parse(await readFile(settingsFile, "utf8"));
      appPassword = existing.database.password;
    }
    if (!/^[0-9a-f]{64}$/.test(appPassword))
      throw new Error("Ungültiger interner Einrichtungsschlüssel.");
    // A settings file can survive an interrupted setup while the role/database is missing.
    progress("TecMon-Anwendungskonto und CS-Demo-Manager-Datenbank anlegen …");
    const passFile = path.join(privateDir, "admin-auth.tmp");
    const escapedPassword = options.password.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
    await writeFile(
      passFile,
      `127.0.0.1:${config.port}:postgres:tecmon_admin:${escapedPassword}\n`,
      { mode: 0o600 },
    );
    try {
      await runTool(psql, args, {
        env: { ...process.env, PGPASSFILE: passFile, PGPASSWORD: "", PGCONNECT_TIMEOUT: "5" },
        input: `SELECT 'CREATE ROLE tecmon_csdm LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='tecmon_csdm')\n\\gexec\nALTER ROLE tecmon_csdm PASSWORD '${appPassword}';\nSELECT 'CREATE DATABASE tecmon_csdm OWNER tecmon_csdm ENCODING ''UTF8''' WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname='tecmon_csdm')\n\\gexec\n`,
      });
    } finally {
      await unlink(passFile).catch(() => {});
    }
    progress("CS Demo Manager, HLAE und FFmpeg automatisch konfigurieren …");
    const template = JSON.parse(await readFile(path.join(root, "csdm-defaults.json"), "utf8"));
    let settings = template;
    if (hasSettings) settings = JSON.parse(await readFile(settingsFile, "utf8"));
    settings.autoDownloadUpdates = false; // Versions and configuration schema are pinned to this installer.
    settings.database = {
      hostname: "127.0.0.1",
      port: config.port,
      username: "tecmon_csdm",
      password: appPassword,
      database: "tecmon_csdm",
    };
    settings.ui = { ...settings.ui, theme: "dark", locale: "de" };
    settings.playback = {
      ...settings.playback,
      customCs2LocationEnabled: !!config.cs2Exe,
      cs2ExecutablePath: config.cs2Exe,
      playerVoicesEnabled: false,
    };
    settings.video = {
      ...settings.video,
      recordingSystem: "HLAE",
      recordingOutput: "video",
      encoderSoftware: "FFmpeg",
      width: 1920,
      height: 1080,
      framerate: 60,
      concatenateSequences: true,
      outputFolderPath: config.outputDir,
      playerVoicesEnabled: false,
      hlae: {
        customLocationEnabled: true,
        customExecutableLocation: config.hlaeExe,
        configFolderEnabled: true,
        configFolderPath: path.join(privateDir, "hlae-config"),
      },
      ffmpegSettings: {
        ...settings.video.ffmpegSettings,
        customLocationEnabled: true,
        customExecutableLocation: config.ffmpegExe,
        videoContainer: "mp4",
        videoCodec: "libx264",
        audioCodec: "aac",
      },
    };
    if (options.demoDir) {
      settings.folders = [{ path: options.demoDir, includeSubFolders: true }];
      settings.demos.currentFolderPath = options.demoDir;
    }
    await writeFile(settingsFile, JSON.stringify(settings, null, 2), { mode: 0o600 });
    progress("Datenbankanmeldung und Videotools testen …");
    const result = await runTool(
      psql,
      [
        "-X",
        "-w",
        "-h",
        "127.0.0.1",
        "-p",
        String(config.port),
        "-U",
        "tecmon_csdm",
        "-d",
        "tecmon_csdm",
        "-tA",
        "-c",
        "SELECT 1",
      ],
      { env: { ...process.env, PGPASSWORD: appPassword, PGCONNECT_TIMEOUT: "5" } },
    );
    if (result.trim() !== "1") throw new Error("Datenbank-Verbindungstest fehlgeschlagen.");
    await runTool(config.ffmpegExe, ["-version"]);
    const invocation = csdmInvocation(config.csdmExe, ["help"], config);
    await runTool(invocation.exe, invocation.args, { env: invocation.env, timeout: 30000 });
    await writeFile(configFile, JSON.stringify(config, null, 2));
    await unlink(pendingFile).catch(() => {});
    await unlink(bootstrapSecret).catch(() => {});
    progress(
      "Einrichtung abgeschlossen. CS Demo Manager legt seine Tabellen beim ersten Start automatisch an.",
    );
    return config;
  } catch (error) {
    error.message = error.message
      .replaceAll(options.password, "[Passwort]")
      .replaceAll(appPassword || "\u0000", "[Anwendungskennwort]");
    await stopManagedDatabase(config).catch(() => {});
    throw error;
  }
}
