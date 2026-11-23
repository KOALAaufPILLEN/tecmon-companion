/**
 * Windows PowerShell ohne Skriptdatei starten.
 *
 * Auf vielen PCs ist die Ausführung von .ps1-Dateien gesperrt (Execution Policy „Restricted“,
 * „AllSigned“ oder per Gruppenrichtlinie). Das trifft auch Administratoren, und eine per
 * Gruppenrichtlinie gesetzte Sperre lässt sich mit `-ExecutionPolicy Bypass` nicht umgehen.
 * Die Sperre gilt nur für Skriptdateien, nicht für Befehle: Darum geht das Skript als
 * `-EncodedCommand` (UTF-16LE, Base64) mit. Werte kommen nie in den Skripttext, sondern
 * über Umgebungsvariablen oder das Arbeitsverzeichnis.
 */
export function powershellArgs(script) {
  return ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", Buffer.from(String(script), "utf16le").toString("base64")];
}

/**
 * Entpackt ein Zip (Pfade aus TECMON_UNPACK_ARCHIVE und TECMON_UNPACK_DESTINATION).
 * Kein Expand-Archive: Wird powershell.exe aus PowerShell 7 gestartet, erbt es dessen
 * PSModulePath und lädt das Archiv-Modul von PowerShell 7, das in Windows PowerShell 5.1
 * mit "Cannot find an overload for ExtractToDirectory" abbricht. .NET direkt ist eindeutig;
 * ab .NET Framework 4.6.2 lehnt ExtractToDirectory Pfade außerhalb des Ziels ab.
 */
export const UNPACK_SCRIPT = [
  "$ErrorActionPreference='Stop'",
  "$archive=$env:TECMON_UNPACK_ARCHIVE",
  "$destination=$env:TECMON_UNPACK_DESTINATION",
  "if(-not $archive -or -not $destination){throw 'Entpacken: Pfade fehlen.'}",
  "Add-Type -AssemblyName System.IO.Compression.FileSystem",
  "if(Test-Path -LiteralPath $destination){Remove-Item -LiteralPath $destination -Recurse -Force}",
  "[System.IO.Compression.ZipFile]::ExtractToDirectory($archive,$destination)",
].join("\n");

/** Argumente und Umgebung für das Entpacken eines Tool-Pakets. */
export function unpackCommand(archive, destination, env = process.env) {
  return {
    args: powershellArgs(UNPACK_SCRIPT),
    env: { ...env, TECMON_UNPACK_ARCHIVE: archive, TECMON_UNPACK_DESTINATION: destination },
  };
}
