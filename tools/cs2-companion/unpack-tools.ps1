param(
  [Parameter(Mandatory=$true)][string]$Archive,
  [Parameter(Mandatory=$true)][string]$Destination
)
# Wird seit 0.48.2 nicht mehr aufgerufen (gesperrte Skriptausführung brach die Einrichtung ab):
# Das Entpacken läuft als -EncodedCommand aus powershell.mjs. Die Datei bleibt nur, weil ältere
# Update-Programme sie in der Dateiliste erwarten.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if(Test-Path -LiteralPath $Destination){Remove-Item -LiteralPath $Destination -Recurse -Force}
[System.IO.Compression.ZipFile]::ExtractToDirectory($Archive,$Destination)
