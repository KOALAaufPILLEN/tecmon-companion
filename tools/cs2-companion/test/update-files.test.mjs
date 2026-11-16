import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { REWRITER_EXE } from "../agent-swap.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const read = (file) => readFileSync(root + file, "utf8");

test("Update-Datei darf jede Datei einspielen, die das Update-Paket enthält", () => {
  const native = read("tools/cs2-companion/windows/TecMon.cs");
  const list = native.match(/UpdateFiles=\{([^}]*)\}/);
  assert.ok(list, "Liste UpdateFiles fehlt");
  const allowed = [...list[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const script = read("scripts/build-companion-update.ps1");
  assert.match(script, new RegExp(REWRITER_EXE.replace(".", "\\.")));
  assert.ok(allowed.includes(REWRITER_EXE), `${REWRITER_EXE} fehlt in UpdateFiles`);
  assert.ok(allowed.includes("TecMon Companion.exe"));
});
