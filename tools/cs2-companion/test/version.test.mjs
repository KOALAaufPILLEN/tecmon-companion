import test from "node:test";
import assert from "node:assert/strict";
import { findMismatches, packageVersion } from "../../../scripts/version.mjs";
import { VERSION } from "../updater.mjs";

test("Versionsnummer ist in allen Dateien gleich", () => {
  assert.deepEqual(findMismatches(), []);
  assert.equal(VERSION, packageVersion());
});
