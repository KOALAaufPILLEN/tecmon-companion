param(
  [Parameter(Mandatory=$true)][string]$Archive,
  [Parameter(Mandatory=$true)][string]$Destination
)
$ErrorActionPreference='Stop'
# Kein Expand-Archive: Wird powershell.exe aus PowerShell 7 gestartet, erbt es dessen
# PSModulePath und lädt das Archiv-Modul von PowerShell 7, das in Windows PowerShell 5.1
# mit "Cannot find an overload for ExtractToDirectory" abbricht. .NET direkt ist eindeutig;
# ab .NET Framework 4.6.2 lehnt ExtractToDirectory Pfade außerhalb des Ziels ab.
Add-Type -AssemblyName System.IO.Compression.FileSystem
if(Test-Path -LiteralPath $Destination){Remove-Item -LiteralPath $Destination -Recurse -Force}
[System.IO.Compression.ZipFile]::ExtractToDirectory($Archive,$Destination)
