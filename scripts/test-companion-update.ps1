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
$updater=Join-Path $workspace 'out/TecMon-Companion-Update-0.10.0.exe'
$lockedFile=Join-Path $target 'TecMon Companion.exe'
[IO.File]::WriteAllText($lockedFile,'previous desktop host')
$held=[IO.File]::Open($lockedFile,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
$elapsed=[Diagnostics.Stopwatch]::StartNew()
$process=Start-Process -FilePath $updater -ArgumentList @('--apply-update-test',('"'+$target+'"')) -WindowStyle Hidden -PassThru
try {Start-Sleep -Milliseconds 1200;if($process.HasExited){throw 'Updater did not wait for the desktop file lock'}}finally{$held.Dispose()}
if(-not $process.WaitForExit(30000)){ $process.Kill(); throw 'Native updater timed out' }
if($process.ExitCode -ne 0){throw 'Native updater failed'}
if($elapsed.ElapsedMilliseconds -lt 1200){throw 'Desktop release wait was skipped'}
foreach($file in @('Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.WinForms.dll','WebView2Loader.dll','WebView2-LICENSE.txt','WebView2-NOTICE.txt')){if(-not(Test-Path -LiteralPath (Join-Path $target $file))){throw ('Desktop dependency missing: '+$file)}}
$desktop=Start-Process -FilePath (Join-Path $target 'TecMon Companion.exe') -ArgumentList '--desktop-self-test' -WindowStyle Hidden -Wait -PassThru
if($desktop.ExitCode -ne 0){throw 'Desktop geometry self-test failed'}
if((Get-FileHash -LiteralPath $configFile).Hash -ne $before){throw 'Installation configuration changed'}
if((Get-Content -LiteralPath (Join-Path $private 'sentinel.txt') -Raw).Trim() -ne 'keep private data'){throw 'Private data changed'}
if((Get-Content -LiteralPath (Join-Path $target 'runtime/sentinel.txt') -Raw).Trim() -ne 'keep runtime'){throw 'Runtime changed'}
if((Get-Item -LiteralPath (Join-Path $target 'server.mjs')).LastWriteTimeUtc -ne $timestamp){throw 'Identical file was replaced'}
if(-not(Test-Path -LiteralPath (Join-Path $target 'updater.mjs'))){throw 'New module missing'}
Write-Output 'PASS: native update adds program files, preserves configuration/data/runtime and skips identical files. No real database or user installation touched.'
