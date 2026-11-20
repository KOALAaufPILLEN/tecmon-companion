import { readFile, writeFile, rename, mkdir, rm, readdir } from "node:fs/promises";
import { spawn as nodeSpawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

/**
 * Scoreboard-Foto (Wardogs, Capability `scoreboard-v1`).
 *
 * Auf Strg+Alt+S nimmt der Companion für BURST_SECONDS ein paar Bildschirmfotos
 * (FFmpeg `ddagrab`, wie beim Clip-Puffer: kein Zugriff auf das Spiel). Die Fotos
 * liest die Texterkennung von Windows lokal aus (Windows.Media.Ocr über Windows
 * PowerShell), danach werden sie sofort gelöscht. Gespeichert werden nur die Werte
 * der eigenen Zeile. Kein Dauerlauf, kein Mitlesen der Tastatur, keine Tipps aus
 * den Werten während der Runde.
 */

export const SCOREBOARD_CAPABILITY = "scoreboard-v1";
export const SCOREBOARD_HOTKEY = "Strg+Alt+S";
export const BURST_SECONDS = 4;
const BURST_FPS = 2;
const MAX_SNAPSHOTS = 500;
const NAME_MAX = 32;

/**
 * Spaltenköpfe, die die Texterkennung als Kopfzeile erkennt (klein, ohne Satzzeichen).
 * Mehrere Sprachen, weil Spiele ihre Oberfläche übersetzen.
 */
export const COLUMNS = {
  kills: ["k", "kills", "kill", "abschüsse", "abschusse", "elims", "eliminations", "eliminierungen", "kos"],
  deaths: ["d", "deaths", "death", "tode", "tod"],
  assists: ["a", "assists", "assist", "vorlagen", "unterstützungen"],
  score: ["score", "punkte", "pts", "points"],
  money: ["$", "money", "geld", "cash", "credits", "funds", "bank"],
};
export const VALUE_KEYS = Object.keys(COLUMNS);
export const LABELS = { kills: "Kills", deaths: "Tode", assists: "Assists", score: "Punkte", money: "Geld" };

const norm = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9$]/g, "");

export function cleanName(value) {
  return String(value || "")
    .replace(/[\x00-\x1f"\\<>]/g, "")
    .trim()
    .slice(0, NAME_MAX);
}

function distance(a, b) {
  if (a === b) return 0;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** Zahl aus einem Texterkennungs-Wort: „1.250“, „1,250“, „$3400“, „12“. Verwechslungen O→0, l/I→1. */
export function readNumber(text) {
  let t = String(text || "").trim();
  if (!/\d/.test(t)) return null;
  t = t.replace(/[Oo]/g, "0").replace(/[lI|]/g, "1").replace(/[$€£\s]/g, "");
  if (!/^-?\d{1,3}([.,']\d{3})+$|^-?\d+$/.test(t)) return null;
  const value = Number(t.replace(/[.,']/g, ""));
  return Number.isSafeInteger(value) && value >= 0 && value <= 99999999 ? value : null;
}

/** Wörter einer Texterkennung zu Zeilen gruppieren (gleiche Höhe, ±60 % der Wortgröße). */
export function groupLines(words) {
  const sorted = words
    .filter((w) => w && typeof w.t === "string" && Number.isFinite(w.x) && Number.isFinite(w.y))
    .map((w) => ({ ...w, h: w.h || 10, w: w.w || 10, cy: w.y + (w.h || 10) / 2, cx: w.x + (w.w || 10) / 2 }))
    .sort((a, b) => a.cy - b.cy);
  const lines = [];
  for (const word of sorted) {
    const line = lines.at(-1);
    if (line && Math.abs(line.cy - word.cy) <= Math.max(line.h, word.h) * 0.6) {
      line.words.push(word);
      line.cy = (line.cy * (line.words.length - 1) + word.cy) / line.words.length;
      line.h = Math.max(line.h, word.h);
    } else lines.push({ cy: word.cy, h: word.h, words: [word] });
  }
  for (const line of lines) line.words.sort((a, b) => a.x - b.x);
  return lines;
}

function headerOf(line) {
  const found = {};
  for (const word of line.words) {
    const key = norm(word.t);
    for (const [column, names] of Object.entries(COLUMNS))
      if (!found[column] && names.includes(key)) found[column] = word.cx;
  }
  return found;
}

function nameMatch(line, name) {
  const wanted = norm(name);
  if (wanted.length < 2) return 0;
  // Namen können aus mehreren Wörtern bestehen: jede Folge von bis zu 3 Wörtern prüfen.
  let best = 0;
  for (let i = 0; i < line.words.length; i++) {
    let text = "";
    for (let j = i; j < Math.min(line.words.length, i + 3); j++) {
      text += norm(line.words[j].t);
      const tolerance = Math.max(1, Math.floor(wanted.length / 5));
      const d = text.includes(wanted) ? 0 : distance(text, wanted);
      if (d <= tolerance) best = Math.max(best, 1 - d / (wanted.length + 1));
    }
  }
  return best;
}

/**
 * Eine Texterkennung auswerten: Kopfzeile mit mindestens zwei bekannten Spalten finden,
 * darunter die Zeile mit dem eigenen Namen, und je Spalte die Zahl, die am nächsten unter
 * dem Spaltenkopf steht. Fehlt die Geld-Spalte, gilt ein „$1234“ außerhalb der Tabelle als
 * Geld aus dem HUD. Gibt `null` zurück, wenn kein Scoreboard mit eigenem Namen zu sehen ist.
 */
export function parseScoreboard({ words = [], width = 0 } = {}, playerName) {
  const lines = groupLines(words);
  let best = null;
  for (let h = 0; h < lines.length; h++) {
    const header = headerOf(lines[h]);
    const columns = Object.keys(header);
    if (columns.length < 2) continue;
    for (let r = h + 1; r < lines.length; r++) {
      const match = nameMatch(lines[r], playerName);
      if (!match) continue;
      const values = {};
      const used = new Set();
      const tolerance = Math.max(40, (width || 1920) * 0.04);
      for (const column of columns) {
        let pick = null;
        for (const word of lines[r].words) {
          if (used.has(word)) continue;
          const value = readNumber(word.t);
          if (value === null) continue;
          const gap = Math.abs(word.cx - header[column]);
          if (gap <= tolerance && (!pick || gap < pick.gap)) pick = { word, value, gap };
        }
        if (pick) {
          values[column] = pick.value;
          used.add(pick.word);
        }
      }
      const score = Object.keys(values).length + columns.length * 0.1 + match;
      if (Object.keys(values).length && (!best || score > best.score))
        best = { score, values, columns, match, source: { money: values.money !== undefined ? "scoreboard" : "" } };
    }
  }
  if (!best) return null;
  if (best.values.money === undefined) {
    for (const word of words) {
      if (!/^\$\s?\d/.test(String(word.t || "").trim())) continue;
      const value = readNumber(word.t);
      if (value !== null) {
        best.values.money = value;
        best.source.money = "hud";
        break;
      }
    }
  }
  return {
    values: best.values,
    columns: best.columns,
    confidence: Math.round(Math.min(1, best.match) * 100) / 100,
    moneySource: best.source.money || "",
  };
}

/** Bestes Foto einer Serie: das mit den meisten gelesenen Werten. */
export function pickBest(results, playerName) {
  let best = null;
  for (const result of results) {
    const parsed = parseScoreboard(result, playerName);
    if (!parsed) continue;
    const count = Object.keys(parsed.values).length + parsed.confidence;
    if (!best || count > best.count) best = { ...parsed, count };
  }
  if (!best) return null;
  delete best.count;
  return best;
}

export function burstArgs() {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `ddagrab=output_idx=0:framerate=${BURST_FPS}:draw_mouse=0`,
    "-frames:v",
    String(BURST_SECONDS * BURST_FPS),
    // Windows-Texterkennung verträgt keine riesigen Bilder: höchstens 1080 Zeilen.
    "-vf",
    "hwdownload,format=bgra,scale=-2:'min(1080,ih)':flags=bicubic",
    "foto%02d.png",
  ];
}

/** Windows PowerShell 5.1 kann die WinRT-Texterkennung direkt laden. Kein Download, keine Fremdsoftware. */
export const OCR_SCRIPT = String.raw`param([Parameter(Mandatory=$true)][string]$Folder)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation` + "`" + String.raw`1' })[0]
function Wait-Op($op, [Type]$type) { $task = $asTask.MakeGenericMethod($type).Invoke($null, @($op)); $task.Wait() | Out-Null; $task.Result }
$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if (-not $engine) { [Console]::Error.WriteLine('Windows-Texterkennung ist für keine installierte Sprache verfügbar.'); exit 3 }
Get-ChildItem -LiteralPath $Folder -Filter 'foto*.png' | Sort-Object Name | ForEach-Object {
  $file = Wait-Op ([Windows.Storage.StorageFile]::GetFileFromPathAsync($_.FullName)) ([Windows.Storage.StorageFile])
  $stream = Wait-Op ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  try {
    $decoder = Wait-Op ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
    $bitmap = Wait-Op ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
    $result = Wait-Op ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
    $words = @(foreach ($line in $result.Lines) { foreach ($w in $line.Words) { @{ t = $w.Text; x = [int]$w.BoundingRect.X; y = [int]$w.BoundingRect.Y; w = [int]$w.BoundingRect.Width; h = [int]$w.BoundingRect.Height } } })
    [Console]::Out.WriteLine((ConvertTo-Json -Compress -Depth 4 @{ file = $_.Name; width = $bitmap.PixelWidth; height = $bitmap.PixelHeight; words = $words }))
  } finally { $stream.Dispose() }
}
`;

function run(spawnProcess, exe, args, cwd, timeout) {
  return new Promise((resolve, reject) => {
    const child = spawnProcess(exe, args, { cwd, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let errors = "";
    child.stdout?.on("data", (d) => {
      out += d;
      if (out.length > 8 * 1024 * 1024) child.kill();
    });
    child.stderr?.on("data", (d) => (errors = (errors + d).slice(-4000)));
    const timer = setTimeout(() => child.kill(), timeout);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(errors.trim().split("\n").pop() || `Beendet mit Code ${code}`));
    });
  });
}

export function parseOcrOutput(text) {
  const results = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const data = JSON.parse(line);
      const words = Array.isArray(data.words) ? data.words : data.words ? [data.words] : [];
      results.push({ width: Number(data.width) || 0, height: Number(data.height) || 0, words });
    } catch {
      /* unvollständige Zeile ignorieren */
    }
  }
  return results;
}

async function writeAtomic(file, text) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, text, { mode: 0o600 });
  await rename(temporary, file);
}

/**
 * @param {object} o
 * @param {string} o.dir Ordner des Wardogs-Pakets im Companion-Profil (wird beim Entfernen gelöscht).
 * @param {string} o.ffmpeg Pfad zu ffmpeg.exe (leer ohne installierten Windows-Companion).
 * @param {string} [o.powershell] Pfad zu Windows PowerShell.
 */
export async function createScoreboard({
  dir,
  ffmpeg,
  powershell = process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe") : "",
  spawnProcess = nodeSpawn,
  now = () => Date.now(),
}) {
  const settingsFile = path.join(dir, "scoreboard.json");
  const snapshotFile = path.join(dir, "scoreboard-stats.json");
  let settings = { enabled: false, playerName: "" };
  let snapshots = [];
  try {
    const saved = JSON.parse(await readFile(settingsFile, "utf8"));
    settings = { enabled: saved.enabled === true, playerName: cleanName(saved.playerName) };
  } catch {
    /* noch nichts gespeichert */
  }
  try {
    const saved = JSON.parse(await readFile(snapshotFile, "utf8"));
    if (Array.isArray(saved)) snapshots = saved.filter((s) => s && typeof s.time === "number" && s.values).slice(-MAX_SNAPSHOTS);
  } catch {
    /* noch keine Werte */
  }
  let busy = false;
  let lastError = "";
  const saveSettings = async () => {
    await mkdir(dir, { recursive: true });
    await writeAtomic(settingsFile, JSON.stringify(settings));
  };
  const saveSnapshots = async () => {
    await mkdir(dir, { recursive: true });
    await writeAtomic(snapshotFile, JSON.stringify(snapshots));
  };
  const available = () => !!ffmpeg && !!powershell;

  return {
    state: () => ({
      ...settings,
      available: available(),
      busy,
      error: lastError,
      hotkey: SCOREBOARD_HOTKEY,
      seconds: BURST_SECONDS,
      count: snapshots.length,
      last: snapshots.at(-1) || null,
    }),
    list: () => snapshots.slice().reverse(),
    async setSettings(input = {}) {
      const next = { ...settings };
      if (typeof input.enabled === "boolean") next.enabled = input.enabled;
      if (input.playerName !== undefined) next.playerName = cleanName(input.playerName);
      if (next.enabled && norm(next.playerName).length < 2)
        throw new Error("Bitte zuerst deinen Ingame-Namen eintragen. Daran erkennt TecMon deine Zeile im Scoreboard.");
      settings = next;
      await saveSettings();
      return this.state();
    },
    /** Foto-Serie aufnehmen, auswerten, Fotos löschen. Gibt die gelesenen eigenen Werte zurück. */
    async capture() {
      if (!settings.enabled) throw new Error("Scoreboard-Foto ist aus. Im Companion unter Wardogs einschalten.");
      if (!available()) throw new Error("Das Scoreboard-Foto braucht den installierten Windows-Companion.");
      if (busy) throw new Error("Scoreboard-Foto läuft schon.");
      busy = true;
      const work = path.join(dir, `foto-${randomUUID()}`);
      try {
        await mkdir(work, { recursive: true });
        await run(spawnProcess, ffmpeg, burstArgs(), work, (BURST_SECONDS + 15) * 1000);
        await writeFile(path.join(work, "ocr.ps1"), "\ufeff" + OCR_SCRIPT);
        const output = await run(
          spawnProcess,
          powershell,
          ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(work, "ocr.ps1"), "-Folder", work],
          work,
          60000,
        );
        const parsed = pickBest(parseOcrOutput(output), settings.playerName);
        if (!parsed)
          throw new Error(
            `Kein Scoreboard mit „${settings.playerName}“ erkannt. Tab während der ${BURST_SECONDS} Sekunden gedrückt halten und den Ingame-Namen prüfen.`,
          );
        const snapshot = { time: now(), game: "wardogs", ...parsed };
        snapshots.push(snapshot);
        if (snapshots.length > MAX_SNAPSHOTS) snapshots = snapshots.slice(-MAX_SNAPSHOTS);
        await saveSnapshots();
        lastError = "";
        return snapshot;
      } catch (error) {
        lastError = error.message || "Scoreboard-Foto fehlgeschlagen.";
        throw error;
      } finally {
        // Die Fotos enthalten den ganzen Bildschirm: nie liegen lassen.
        await rm(work, { recursive: true, force: true }).catch(() => {});
        busy = false;
      }
    },
    async remove(time) {
      snapshots = snapshots.filter((s) => s.time !== Number(time));
      await saveSnapshots();
    },
    /** Paket entfernt: Einstellungen, Werte und liegengebliebene Fotos löschen. */
    async reset() {
      settings = { enabled: false, playerName: "" };
      snapshots = [];
      lastError = "";
      for (const name of await readdir(dir).catch(() => []))
        if (name === "scoreboard.json" || name === "scoreboard-stats.json" || name.startsWith("foto-"))
          await rm(path.join(dir, name), { recursive: true, force: true }).catch(() => {});
    },
  };
}

/** Text für die Rückmeldung der Figur: „Kills 5 · Tode 2 · Geld 3400“. */
export function summary(values = {}) {
  return VALUE_KEYS.filter((k) => values[k] !== undefined)
    .map((k) => `${LABELS[k]} ${values[k]}`)
    .join(" · ");
}
