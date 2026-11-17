import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import path from "node:path";
import { once } from "node:events";
import { availablePort, runTool, setupManagedInstallation } from "../managed-installation.mjs";

test("process invocation preserves special characters and UTF8 stdin", async () => {
  const value = "quotes \" & apostrophe' ä spaces";
  const result = await runTool(
    process.execPath,
    [
      "-e",
      "let t='';process.stdin.setEncoding('utf8');process.stdin.on('data',x=>t+=x);process.stdin.on('end',()=>process.stdout.write(JSON.stringify([process.argv[1],t])))",
      value,
    ],
    { input: value },
  );
  assert.deepEqual(JSON.parse(result), [value, value]);
  await runTool(process.execPath, ["-e", "process.exit(0)"], { detachedStreams: true });
});
test("selects an available loopback port and rejects invalid ranges", async (t) => {
  const held = net.createServer();
  held.listen(0, "127.0.0.1");
  await once(held, "listening");
  t.after(() => new Promise((resolve) => held.close(resolve)));
  const port = held.address().port;
  if (port < 65400) assert.notEqual(await availablePort(port), port);
  await assert.rejects(availablePort(0), /Port/);
});
test("setup requires consent and a data folder, but no database password", async () => {
  await assert.rejects(setupManagedInstallation("unused", {}), /Lizenz/);
  await assert.rejects(setupManagedInstallation("unused", { acceptLicenses: true }), /Datenordner/);
  await assert.rejects(
    setupManagedInstallation(path.resolve("app"), { acceptLicenses: true, dataDir: "relative" }),
    /vollständige/,
  );
});
