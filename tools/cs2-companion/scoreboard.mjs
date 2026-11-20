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
 * Spaltenköpfe, die die Texterkennung als Kopfzeile erkennt (klein, ohne Satzzeichen und
 * Umlaut-Punkte). Mehrere Sprachen, weil Spiele ihre Oberfläche übersetzen. Abgeschnittene
 * Köpfe (Wardogs: „WIEDERBELEBUN…“) zählen ab 5 Buchstaben über den Wortanfang.
 */
export const COLUMNS = {
  kills: ["k", "kills", "kill", "abschüsse", "abschusse", "elims", "eliminations", "eliminierungen", "kos", "totungen", "toetungen"],
  deaths: ["d", "deaths", "death", "tode", "tod", "todesfalle", "todesfaelle"],
  assists: ["a", "assists", "assist", "vorlagen", "unterstützungen", "unterstutzungen"],
  revives: ["revives", "revive", "wiederbelebungen", "wiederbelebt"],
  score: ["score", "punkte", "pts", "points"],
  money: ["$", "money", "geld", "cash", "credits", "funds", "bank", "verdientes", "verdientesgeld", "earned"],
};
/** `cash` ist der Kontostand oben im HUD (über dem Scoreboard), `money` die Geld-Spalte. */
export const VALUE_KEYS = [...Object.keys(COLUMNS), "cash"];
export const LABELS = { kills: "Kills", deaths: "Tode", assists: "Assists", revives: "Wiederbelebungen", score: "Punkte", money: "Geld", cash: "Kontostand" };

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

/**
 * Geldbetrag aus einer Spalte, in der jeder Wert mit „$“ beginnt. Die Texterkennung liest
 * das „$“ oft als „s“, „S“, „5“, „8“ oder „9“: „so“ = $0, „82.413“ = $2.413. Nur benutzen,
 * wenn die Spalte nachweislich „$“-Werte hat (`dollarColumn`), sonst `readNumber()`.
 */
export function readMoney(text) {
  let t = String(text || "").trim().replace(/^[|[(]+/, "");
  if (/^[sS$][oO0]$/.test(t)) return 0;
  if (/^[sS]\d/.test(t)) t = t.slice(1);
  else if (/^[5689]\d[.,]\d{3}$/.test(t)) t = t.slice(1);
  return readNumber(t);
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

/** Spalte zu einem Wort der Kopfzeile, auch für abgeschnittene Köpfe ab 5 Buchstaben. */
export function columnOf(text) {
  const key = norm(text);
  if (!key) return "";
  for (const [column, names] of Object.entries(COLUMNS)) if (names.includes(key)) return column;
  if (key.length >= 5)
    for (const [column, names] of Object.entries(COLUMNS))
      if (names.some((name) => name.length > key.length && name.startsWith(key))) return column;
  return "";
}

/**
 * Kopfzeile, deren unterste Zeile `lines[h]` ist. Spaltenköpfe dürfen zwei Zeilen hoch sein
 * (Wardogs setzt „WIEDERBELEBUN…“ etwas höher); aus den oberen Zeilen zählen nur Wörter mit
 * mindestens 3 Buchstaben, damit einzelne Zeichen nicht als „K“, „D“ oder „A“ gelten.
 * Mehrwortköpfe („VERDIENTES GELD“) werden zu einer Spalte zusammengefasst.
 */
function headerAt(lines, h) {
  const bottom = lines[h];
  const band = Math.max(bottom.h, 10) * 2.5;
  const found = {};
  for (let i = h; i >= 0 && bottom.cy - lines[i].cy <= band; i--) {
    for (const word of lines[i].words) {
      if (i !== h && norm(word.t).length < 3) continue;
      const column = columnOf(word.t);
      if (!column) continue;
      const span = (found[column] ||= { left: word.x, right: word.x + word.w, top: word.y, sum: 0, count: 0 });
      span.left = Math.min(span.left, word.x);
      span.right = Math.max(span.right, word.x + word.w);
      span.top = Math.min(span.top, word.y);
      span.sum += word.cx;
      span.count++;
    }
  }
  for (const span of Object.values(found)) span.cx = span.sum / span.count;
  return found;
}

/** Abstand einer Zahl zu einer Spalte: Werte stehen linksbündig oder mittig unter dem Kopf. */
const gapTo = (word, span) => Math.min(Math.abs(word.x - span.left), Math.abs(word.cx - span.cx));

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

/** Kennung so vereinheitlichen, wie die Texterkennung sie verwechselt (O/0, I/l/1). */
const codeNorm = (text) =>
  String(text || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");

/**
 * Wardogs zeigt oben rechts „RELAY XXXX-XXX“; dieselbe Kennung steht in der eigenen Zeile.
 * Ersatz, wenn der Name nicht lesbar ist: gilt nur, wenn genau eine Zeile passt.
 */
function relayRow(lines, from) {
  let code = "";
  for (const line of lines) {
    const relay = line.words.find((w) => norm(w.t) === "relay");
    if (!relay) continue;
    // Rechts daneben das erste Wort, das wie eine Kennung aussieht (davor kann der Ping stehen).
    const next = line.words.find((w) => w.x > relay.x && codeNorm(w.t).length >= 6);
    if (next) code = codeNorm(next.t);
    if (code) break;
  }
  if (code.length < 6) return -1;
  const hits = [];
  for (let r = from; r < lines.length; r++)
    if (lines[r].words.some((w) => { const c = codeNorm(w.t); return c.length >= code.length - 1 && distance(c, code) <= 2; }))
      hits.push(r);
  return hits.length === 1 ? hits[0] : -1;
}

/** Hat die Geld-Spalte „$“-Werte? Dann darf `readMoney()` ein verlesenes „$“ abschneiden. */
function dollarColumn(lines, from, span, tolerance) {
  let count = 0;
  for (let r = from; r < lines.length; r++)
    for (const word of lines[r].words) if (/^\$\s?\d/.test(word.t.trim()) && gapTo(word, span) <= tolerance) count++;
  return count >= 2;
}

function rowValues(line, header, columns, tolerance, dollars) {
  const picks = {};
  for (const word of line.words) {
    let best = null;
    for (const column of columns) {
      const value = column === "money" && dollars ? readMoney(word.t) : readNumber(word.t);
      if (value === null) continue;
      const gap = gapTo(word, header[column]);
      if (gap <= tolerance && (!best || gap < best.gap)) best = { column, gap, value };
    }
    if (best && (!picks[best.column] || best.gap < picks[best.column].gap)) picks[best.column] = best;
  }
  return Object.fromEntries(Object.entries(picks).map(([column, pick]) => [column, pick.value]));
}

/**
 * Eine Texterkennung auswerten: Kopfzeile mit mindestens zwei bekannten Spalten finden,
 * darunter die Zeile mit dem eigenen Namen (sonst über die RELAY-Kennung), und jede Zahl
 * der Zeile der nächsten Spalte zuordnen. Ein „$1234“ über der Tabelle gilt als Kontostand
 * (`cash`); fehlt die Geld-Spalte, zählt ein „$1234“ außerhalb der Tabelle als Geld aus dem
 * HUD. Gibt `null` zurück, wenn kein Scoreboard mit eigener Zeile zu sehen ist.
 */
export function parseScoreboard({ words = [], width = 0 } = {}, playerName) {
  const lines = groupLines(words);
  const tolerance = Math.max(40, (width || 1920) * 0.04);
  let best = null;
  for (let h = 0; h < lines.length; h++) {
    const header = headerAt(lines, h);
    const columns = Object.keys(header);
    if (columns.length < 2) continue;
    const dollars = header.money ? dollarColumn(lines, h + 1, header.money, tolerance) : false;
    const rows = [];
    for (let r = h + 1; r < lines.length; r++) {
      const match = nameMatch(lines[r], playerName);
      if (match) rows.push({ r, match });
    }
    if (!rows.length) {
      const r = relayRow(lines, h + 1);
      if (r >= 0) rows.push({ r, match: 0.6, relay: true });
    }
    for (const { r, match, relay } of rows) {
      const values = rowValues(lines[r], header, columns, tolerance, dollars);
      const count = Object.keys(values).length;
      const score = count + columns.length * 0.1 + match;
      if (count && (!best || score > best.score))
        best = { score, values, columns, match, relay: !!relay, top: Math.min(...Object.values(header).map((s) => s.top)) };
    }
  }
  if (!best) return null;
  let moneySource = best.values.money !== undefined ? "scoreboard" : "";
  for (const word of [...words].sort((a, b) => a.y - b.y)) {
    if (!/^\$\s?\d/.test(String(word.t || "").trim())) continue;
    const value = readNumber(word.t);
    if (value === null) continue;
    if (word.y + (word.h || 10) < best.top) {
      if (best.values.cash === undefined) best.values.cash = value;
    } else if (best.values.money === undefined && !best.columns.includes("money")) {
      best.values.money = value;
      moneySource = "hud";
    }
  }
  return {
    values: best.values,
    columns: best.columns,
    confidence: Math.round(Math.min(1, best.match) * 100) / 100,
    moneySource,
    ...(best.relay ? { matchedBy: "relay" } : {}),
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
