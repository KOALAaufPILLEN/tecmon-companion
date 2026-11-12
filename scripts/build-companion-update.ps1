param(
  [Parameter(Mandatory=$true)][string]$ApplicationDirectory,
  [Parameter(Mandatory=$true)][string]$BuildDirectory,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [string]$Version=''
)
$ErrorActionPreference='Stop'
if(!$Version){$Version=(Get-Content -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) 'package.json') -Raw|ConvertFrom-Json).version}
if($Version -notmatch '^\d+\.\d+\.\d+$'){throw 'Invalid version'}
$repo=Split-Path -Parent $PSScriptRoot
$source=Join-Path $repo 'tools/cs2-companion'
$stage=Join-Path $BuildDirectory 'update-app'
if(Test-Path -LiteralPath $stage){throw 'Fresh update build directory required'}
New-Item -ItemType Directory -Path $stage,$OutputDirectory -Force | Out-Null
Copy-Item -Path (Join-Path $source '*.mjs') -Destination $stage
Copy-Item -LiteralPath (Join-Path $source 'public') -Destination $stage -Recurse
foreach($name in @('README.md','unpack-tools.ps1')) {Copy-Item -LiteralPath (Join-Path $source $name) -Destination $stage}
foreach($name in @('dependency-manifest.json','THIRD-PARTY-NOTICES.txt')) {Copy-Item -LiteralPath (Join-Path $source ('windows/'+$name)) -Destination $stage}
Copy-Item -LiteralPath (Join-Path $ApplicationDirectory 'csdm-defaults.json') -Destination $stage
& (Join-Path $PSScriptRoot 'prepare-companion-desktop.ps1') -Stage $stage -Cache (Join-Path $BuildDirectory 'desktop-cache')
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$native=Join-Path $source 'windows/TecMon.cs'
$refs=@('/nologo','/target:winexe','/platform:x64','/optimize+','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:System.Web.Extensions.dll','/r:Microsoft.CSharp.dll',('/win32icon:'+(Join-Path $source 'windows/tecmon.ico')))
$refs+=('/resource:'+(Join-Path $source 'public/splash-logo.png')+',TecMonLogo')
$refs+=('/resource:'+(Join-Path $source 'public/desktop-bot.png')+',TecMonBot')
$refs+=('/resource:'+(Join-Path $source 'public/desktop-bot-3d.png')+',TecMonBot3D')
& $compiler @refs ('/out:'+(Join-Path $stage 'TecMon Companion.exe')) $native
if($LASTEXITCODE -ne 0){throw 'Launcher build failed'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=Join-Path $BuildDirectory 'update.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$zip,[IO.Compression.CompressionLevel]::Optimal,$false)
$filename='TecMon-Companion-Update-'+$Version+'.exe'
$updater=Join-Path $OutputDirectory $filename
& $compiler @refs ('/out:'+$updater) ('/resource:'+$zip+',TecMonUpdate') $native
if($LASTEXITCODE -ne 0){throw 'Updater build failed'}
@{version=$Version;filename=$filename;sha256=(Get-FileHash -LiteralPath $updater).Hash.ToLowerInvariant();size=(Get-Item -LiteralPath $updater).Length} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $OutputDirectory 'TecMon-Companion-Update.json') -Encoding utf8
Write-Output $updater
