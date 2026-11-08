param([string]$NodeExe, [string]$NodeLicense)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$packageRoot = Join-Path ([IO.Path]::GetTempPath()) ('tecmon-package-' + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $packageRoot 'TecMon-Companion'
New-Item -ItemType Directory -Path $stage -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/server.mjs'),(Join-Path $repo 'tools/cs2-companion/job.mjs'),(Join-Path $repo 'tools/cs2-companion/Start-TecMon.cmd'),(Join-Path $repo 'tools/cs2-companion/README.md') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/public') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/postgresql.mjs'),(Join-Path $repo 'tools/cs2-companion/postgres-setup.mjs'),(Join-Path $repo 'tools/cs2-companion/Install-PostgreSQL.cmd') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/managed-installation.mjs'),(Join-Path $repo 'tools/cs2-companion/install-backend.mjs') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/windows') -Destination $stage -Recurse
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/share-code.mjs'),(Join-Path $repo 'tools/cs2-companion/demo-download.mjs') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/download-tools.mjs'),(Join-Path $repo 'tools/cs2-companion/unpack-tools.ps1') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/updater.mjs') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/browser-bridge.mjs') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/recording-engine.mjs') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/branding-assets.mjs'),(Join-Path $repo 'tools/cs2-companion/video-branding.mjs') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/lazy-engine.mjs') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/update-handoff.mjs') -Destination $stage
Copy-Item -LiteralPath (Join-Path $repo 'tools/cs2-companion/browser-demo.mjs') -Destination $stage
if ($NodeExe -or $NodeLicense) {
  if (-not ($NodeExe -and $NodeLicense)) { throw 'NodeExe und NodeLicense zusammen angeben.' }
  New-Item -ItemType Directory -Path (Join-Path $stage 'runtime') | Out-Null
  Copy-Item -LiteralPath $NodeExe -Destination (Join-Path $stage 'runtime/node.exe')
  Copy-Item -LiteralPath $NodeLicense -Destination (Join-Path $stage 'runtime/LICENSE')
}
$downloads = Join-Path $repo 'public/downloads'
New-Item -ItemType Directory -Path $downloads -Force | Out-Null
$zip = Join-Path $downloads 'tecmon-cs2-companion.zip'
Compress-Archive -LiteralPath $stage -DestinationPath $zip -Force
Write-Output $zip
# The uniquely named temporary staging directory is intentionally retained for inspection.
