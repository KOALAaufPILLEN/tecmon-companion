param(
  [Parameter(Mandatory=$true)][string]$DependenciesCache,
  [Parameter(Mandatory=$true)][string]$CsDmSource,
  [Parameter(Mandatory=$true)][string]$NodeFolder,
  [Parameter(Mandatory=$true)][string]$BuildDirectory,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [switch]$DownloadVideoTools
)
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$source=Join-Path $repo 'tools/cs2-companion'
$manifest=Get-Content -LiteralPath (Join-Path $source 'windows/dependency-manifest.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Path $BuildDirectory,$DependenciesCache,$OutputDirectory -Force | Out-Null
foreach($entry in $manifest.PSObject.Properties) {
  if($DownloadVideoTools -and $entry.Name -in @('hlae','ffmpeg')) { continue }
  $dependency=$entry.Value
  $file=Join-Path $DependenciesCache $dependency.file
  if(-not(Test-Path -LiteralPath $file)) { Invoke-WebRequest $dependency.url -OutFile $file }
  if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ine $dependency.sha256) { throw ('Checksum mismatch: '+$entry.Name+' (erwartet '+$dependency.sha256+', erhalten '+(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()+')') }
}
$seven=Join-Path $DependenciesCache '7zip/7z.exe'
if(-not(Test-Path -LiteralPath $seven)) { throw '7-Zip CLI aus der offiziellen Distribution im Cache unter 7zip/7z.exe bereitstellen.' }
if((& git -C $CsDmSource rev-parse HEAD) -ne (& git -C $CsDmSource rev-parse 'v3.20.1^{commit}')) { throw 'CS Demo Manager source must be checked out at v3.20.1.' }
$stage=Join-Path $BuildDirectory 'app'
if($DownloadVideoTools -and ((Test-Path -LiteralPath (Join-Path $stage 'tools/hlae')) -or (Test-Path -LiteralPath (Join-Path $stage 'tools/ffmpeg')))) { throw 'Für den Download-Installer einen frischen Build-Ordner verwenden.' }
if(Test-Path -LiteralPath (Join-Path $stage 'installation.json')) { throw 'Build-Ordner enthält eine eingerichtete Datenbank. Einen frischen Build-Ordner wählen.' }
New-Item -ItemType Directory -Path $stage,(Join-Path $stage 'tools') -Force | Out-Null
Copy-Item -Path (Join-Path $source '*.mjs') -Destination $stage -Force
Copy-Item -LiteralPath (Join-Path $source 'unpack-tools.ps1') -Destination $stage -Force
Copy-Item -LiteralPath (Join-Path $source 'public') -Destination $stage -Recurse -Force
Copy-Item -LiteralPath (Join-Path $source 'README.md'),(Join-Path $source 'windows/dependency-manifest.json'),(Join-Path $source 'windows/THIRD-PARTY-NOTICES.txt') -Destination $stage -Force
Copy-Item -LiteralPath (Join-Path $DependenciesCache 'vc_redist.x64.exe') -Destination (Join-Path $stage 'tools/vc_redist.x64.exe') -Force
New-Item -ItemType Directory -Path (Join-Path $stage 'runtime') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $NodeFolder 'node.exe'),(Join-Path $NodeFolder 'LICENSE') -Destination (Join-Path $stage 'runtime') -Force
& node (Join-Path $repo 'scripts/companion-csdm-defaults.mjs') $CsDmSource (Join-Path $stage 'csdm-defaults.json')
if($LASTEXITCODE -ne 0) { throw 'CS Demo Manager settings template failed.' }
& $seven x (Join-Path $DependenciesCache 'csdm.exe') ('-o'+(Join-Path $BuildDirectory 'csdm-installer')) -y | Out-Null
if($LASTEXITCODE -ne 0) { throw 'CS Demo Manager extraction failed.' }
$appArchive=Get-ChildItem -LiteralPath (Join-Path $BuildDirectory 'csdm-installer') -Recurse -Filter app-64.7z | Select-Object -First 1
& $seven x $appArchive.FullName ('-o'+(Join-Path $stage 'tools/csdm')) -y | Out-Null
if($LASTEXITCODE -ne 0) { throw 'CS Demo Manager app extraction failed.' }
& $seven x (Join-Path $DependenciesCache 'postgresql.zip') ('-o'+(Join-Path $BuildDirectory 'pg')) -y | Out-Null
if($LASTEXITCODE -ne 0) { throw 'PostgreSQL extraction failed.' }
$pg=Join-Path $stage 'tools/postgresql'
New-Item -ItemType Directory -Path $pg -Force | Out-Null
foreach($folder in @('bin','lib','share','doc')) { Copy-Item -LiteralPath (Join-Path $BuildDirectory ('pg/pgsql/'+$folder)) -Destination $pg -Recurse -Force }
Copy-Item -Path (Join-Path $BuildDirectory 'pg/pgsql/*license*.txt') -Destination $pg -Force
Copy-Item -LiteralPath (Join-Path $CsDmSource 'LICENSE') -Destination (Join-Path $stage 'tools/csdm/TECMON-UPSTREAM-LICENSE.txt') -Force
if(-not $DownloadVideoTools) {
& $seven x (Join-Path $DependenciesCache 'hlae.zip') ('-o'+(Join-Path $stage 'tools/hlae')) -y | Out-Null
if($LASTEXITCODE -ne 0) { throw 'HLAE extraction failed.' }
& $seven x (Join-Path $DependenciesCache 'ffmpeg.zip') ('-o'+(Join-Path $BuildDirectory 'ffmpeg')) -y | Out-Null
if($LASTEXITCODE -ne 0) { throw 'FFmpeg extraction failed.' }
$ffmpeg=Get-ChildItem -LiteralPath (Join-Path $BuildDirectory 'ffmpeg') -Directory | Select-Object -First 1
$ffTarget=Join-Path $stage 'tools/ffmpeg'
New-Item -ItemType Directory -Path (Join-Path $ffTarget 'bin') -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $ffmpeg.FullName 'bin/ffmpeg.exe'),(Join-Path $ffmpeg.FullName 'bin/ffprobe.exe') -Destination (Join-Path $ffTarget 'bin') -Force
Get-ChildItem -LiteralPath $ffmpeg.FullName -File | Copy-Item -Destination $ffTarget -Force
Copy-Item -LiteralPath (Join-Path $source 'windows/THIRD-PARTY-NOTICES.txt') -Destination (Join-Path $stage 'tools/ffmpeg/TECMON-SOURCE-NOTICE.txt') -Force
}
& (Join-Path $PSScriptRoot 'prepare-companion-desktop.ps1') -Stage $stage -Cache (Join-Path $BuildDirectory 'desktop-cache')
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$native=Join-Path $source 'windows/TecMon.cs'
$refs=@('/nologo','/target:winexe','/platform:x64','/optimize+','/r:System.Windows.Forms.dll','/r:System.Drawing.dll','/r:System.IO.Compression.dll','/r:System.IO.Compression.FileSystem.dll','/r:System.Web.Extensions.dll','/r:Microsoft.CSharp.dll')
$refs+=('/win32icon:'+(Join-Path $source 'windows/tecmon.ico'))
$refs+=('/resource:'+(Join-Path $source 'public/splash-logo.png')+',TecMonLogo')
$refs+=('/resource:'+(Join-Path $source 'public/desktop-bot.png')+',TecMonBot')
& $compiler @refs ('/out:'+(Join-Path $stage 'TecMon Companion.exe')) $native
if($LASTEXITCODE -ne 0) { throw 'Native launcher build failed.' }
Set-Content -LiteralPath (Join-Path $stage 'tecmon-app.marker') -Value 'TecMon Companion 0.3' -Encoding utf8
$payload=Join-Path $BuildDirectory 'payload.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
if(Test-Path -LiteralPath $payload) { Remove-Item -LiteralPath $payload }
[IO.Compression.ZipFile]::CreateFromDirectory($stage,$payload,[IO.Compression.CompressionLevel]::Optimal,$false)
$version=(Get-Content -LiteralPath (Join-Path $repo 'package.json') -Raw|ConvertFrom-Json).version
$setup=Join-Path $OutputDirectory ('TecMon-Companion-Setup-'+$version+'.exe')
$temporarySetup=Join-Path $OutputDirectory ('TecMon-Setup-'+[guid]::NewGuid().ToString('N')+'.exe')
& $compiler @refs ('/out:'+$temporarySetup) ('/resource:'+$payload+',TecMonPayload') ('/resource:'+(Join-Path $source 'windows/THIRD-PARTY-NOTICES.txt')+',TecMonNotices') $native
if($LASTEXITCODE -ne 0) { throw 'Installer build failed.' }
Move-Item -LiteralPath $temporarySetup -Destination $setup -Force
Get-FileHash -LiteralPath $setup -Algorithm SHA256 | Format-List
Write-Output $setup
