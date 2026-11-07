import { fileURLToPath } from "node:url";
import path from "node:path";
import { setupManagedInstallation } from "./managed-installation.mjs";
const root = path.dirname(fileURLToPath(import.meta.url));
let input = "";
for await (const part of process.stdin) {
  input += part;
  if (input.length > 32768) throw new Error("Setup-Daten zu groß.");
}
try {
  const config = await setupManagedInstallation(root, JSON.parse(input), (message) =>
    process.stdout.write(JSON.stringify({ message }) + "\n"),
  );
  process.stdout.write(JSON.stringify({ done: true, port: config.port }) + "\n");
} catch (error) {
  process.stdout.write(JSON.stringify({ error: error.message }) + "\n");
  process.exitCode = 1;
}
