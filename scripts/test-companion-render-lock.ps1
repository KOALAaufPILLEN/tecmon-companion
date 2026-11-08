$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$workspace=Join-Path ([IO.Path]::GetTempPath()) ('tecmon-render-lock-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $workspace | Out-Null
$compiler=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
$launcher=Join-Path $workspace 'TecMon Companion.exe'
$native=(Resolve-Path -LiteralPath (Join-Path $repo 'tools/cs2-companion/windows/TecMon.cs')).Path
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:System.Web.Extensions.dll /r:Microsoft.CSharp.dll ('/out:'+$launcher) $native
if($LASTEXITCODE -ne 0){throw 'Launcher compilation failed'}
$fakeSource=Join-Path $workspace 'fixture.cs'
@'
using System; using System.IO; using System.Threading;
class Fixture { static int Main(string[] args) {File.WriteAllText(args[0],"started");Thread.Sleep(5000);return 0;} }
'@ | Set-Content -LiteralPath $fakeSource -Encoding utf8
$encoder=Join-Path $workspace 'ffmpeg.exe'
& $compiler /nologo /target:exe ('/out:'+$encoder) $fakeSource
if($LASTEXITCODE -ne 0){throw 'Fixture compilation failed'}
$asset=Join-Path $workspace 'visual.txt'
$ready=Join-Path $workspace 'ready.txt'
[IO.File]::WriteAllText($asset,'trusted bytes')
$hash=(Get-FileHash -LiteralPath $asset).Hash.ToLowerInvariant()
function Start-Renderer {
  $request=@{exe=$encoder;cwd=$workspace;args=@($ready);files=@(@{path=$asset;sha256=$hash});timeout=10000}|ConvertTo-Json -Depth 5 -Compress
  $info=New-Object Diagnostics.ProcessStartInfo
  $info.FileName=$launcher;$info.Arguments='--render-locked';$info.UseShellExecute=$false;$info.CreateNoWindow=$true
  $info.RedirectStandardInput=$true;$info.RedirectStandardOutput=$true;$info.RedirectStandardError=$true
  $process=[Diagnostics.Process]::Start($info)
  $process.StandardInput.Write($request);$process.StandardInput.Close()
  return $process
}
$process=Start-Renderer
for($i=0;$i -lt 500 -and -not(Test-Path -LiteralPath $ready);$i++){Start-Sleep -Milliseconds 20}
if(-not(Test-Path -LiteralPath $ready)){throw ('Renderer fixture did not start: '+$process.StandardError.ReadToEnd())}
$writeBlocked=$false;$deleteBlocked=$false
try{[IO.File]::WriteAllText($asset,'tampered')}catch [IO.IOException]{$writeBlocked=$true}
try{[IO.File]::Delete($asset)}catch [IO.IOException]{$deleteBlocked=$true}
if(-not $process.WaitForExit(15000)){$process.Kill();throw 'Render lock test timed out'}
if($process.ExitCode -ne 0){throw ('Renderer failed: '+$process.StandardError.ReadToEnd())}
if(-not $writeBlocked -or -not $deleteBlocked){throw 'Active render asset could be changed or deleted'}
Remove-Item -LiteralPath $ready
[IO.File]::WriteAllText($asset,'tampered after unlock')
$process=Start-Renderer
if(-not $process.WaitForExit(15000)){$process.Kill();throw 'Checksum failure test timed out'}
if($process.ExitCode -eq 0 -or (Test-Path -LiteralPath $ready)){throw 'Changed file reached encoder'}
Write-Output 'PASS: Windows blocks writes/deletion throughout rendering; a changed checksum prevents the encoder from starting.'
