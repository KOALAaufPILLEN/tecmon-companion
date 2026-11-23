import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { powershellArgs, unpackCommand, UNPACK_SCRIPT } from "../powershell.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const decode = (args) => Buffer.from(args[args.indexOf("-EncodedCommand") + 1], "base64").toString("utf16le");

test("PowerShell startet ohne Skriptdatei (gesperrte Execution Policy)", () => {
  const args = powershellArgs("Write-Output 1");
  assert.equal(args.includes("-File"), false);
  assert.deepEqual(args.slice(0, 4), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"]);
  assert.equal(decode(args), "Write-Output 1");
});

test("Entpacken: Pfade nur über Umgebungsvariablen, nie im Skripttext", () => {
  const archive = "C:\\Users\\O'Brien $x\\package.zip";
  const destination = "C:\\Users\\O'Brien $x\\unpacked";
  const { args, env } = unpackCommand(archive, destination, { PATH: "p" });
  const script = decode(args);
  assert.equal(script, UNPACK_SCRIPT);
  assert.equal(script.includes("O'Brien"), false);
  assert.equal(env.TECMON_UNPACK_ARCHIVE, archive);
  assert.equal(env.TECMON_UNPACK_DESTINATION, destination);
  assert.equal(env.PATH, "p");
  assert.doesNotMatch(script, /Expand-Archive/);
});

test("Kein Companion-Code ruft PowerShell mit -File auf", async () => {
  for (const file of ["download-tools.mjs", "scoreboard.mjs", "cs2-verify.mjs"]) {
    const text = await readFile(path.join(root, file), "utf8");
    assert.doesNotMatch(text, /"-File"/, file);
  }
});
