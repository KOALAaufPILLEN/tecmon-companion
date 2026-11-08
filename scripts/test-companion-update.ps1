$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$workspace=Join-Path ([IO.Path]::GetTempPath()) ('tecmon-update-test-'+[guid]::NewGuid().ToString('N'))
$application=Join-Path $workspace 'application'
$target=Join-Path $workspace 'installed'
$data=Join-Path $workspace 'data'
$private=Join-Path $data 'TecMon-Private'
New-Item -ItemType Directory -Path $application,$target,$private,(Join-Path $target 'runtime') -Force | Out-Null
Set-Content -LiteralPath (Join-Path $application 'csdm-defaults.json') -Value '{}'
Set-Content -LiteralPath (Join-Path $target 'tecmon-app.marker') -Value 'test only'
Set-Content -LiteralPath (Join-Path $private 'tecmon-data.marker') -Value 'test only'
Set-Content -LiteralPath (Join-Path $private 'sentinel.txt') -Value 'keep private data'
Set-Content -LiteralPath (Join-Path $target 'runtime/sentinel.txt') -Value 'keep runtime'
$config=@{format='tecmon-installation-v1';dataDir=$data;clusterDir=(Join-Path $private 'postgres/data');postgresBin=(Join-Path $target 'tools/postgresql/bin');installationId='isolated-native-test'} | ConvertTo-Json
$configFile=Join-Path $target 'installation.json'
Set-Content -LiteralPath $configFile -Value $config
$before=(Get-FileHash -LiteralPath $configFile).Hash
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/server.mjs') -Destination (Join-Path $target 'server.mjs')
(Get-Item -LiteralPath (Join-Path $target 'server.mjs')).LastWriteTimeUtc=[DateTime]::UtcNow.AddDays(-1)
$timestamp=(Get-Item -LiteralPath (Join-Path $target 'server.mjs')).LastWriteTimeUtc
& (Join-Path $PSScriptRoot 'build-companion-update.ps1') -ApplicationDirectory $application -BuildDirectory (Join-Path $workspace 'build') -OutputDirectory (Join-Path $workspace 'out')
$updater=Join-Path $workspace 'out/TecMon-Companion-Update-0.7.0.exe'
$process=Start-Process -FilePath $updater -ArgumentList @('--apply-update-test',('"'+$target+'"')) -WindowStyle Hidden -PassThru
if(-not $process.WaitForExit(30000)){ $process.Kill(); throw 'Native updater timed out' }
if($process.ExitCode -ne 0){throw 'Native updater failed'}
if((Get-FileHash -LiteralPath $configFile).Hash -ne $before){throw 'Installation configuration changed'}
if((Get-Content -LiteralPath (Join-Path $private 'sentinel.txt') -Raw).Trim() -ne 'keep private data'){throw 'Private data changed'}
if((Get-Content -LiteralPath (Join-Path $target 'runtime/sentinel.txt') -Raw).Trim() -ne 'keep runtime'){throw 'Runtime changed'}
if((Get-Item -LiteralPath (Join-Path $target 'server.mjs')).LastWriteTimeUtc -ne $timestamp){throw 'Identical file was replaced'}
if(-not(Test-Path -LiteralPath (Join-Path $target 'updater.mjs'))){throw 'New module missing'}
Write-Output 'PASS: native update adds program files, preserves configuration/data/runtime and skips identical files. No real database or user installation touched.'
