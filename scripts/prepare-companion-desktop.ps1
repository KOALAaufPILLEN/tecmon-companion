param([Parameter(Mandatory=$true)][string]$Stage,[Parameter(Mandatory=$true)][string]$Cache)
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Path $Cache,$Stage -Force | Out-Null
$package=Join-Path $Cache 'microsoft.web.webview2.1.0.4314.35.nupkg'
if(-not(Test-Path -LiteralPath $package)){Invoke-WebRequest 'https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/1.0.4314.35/microsoft.web.webview2.1.0.4314.35.nupkg' -OutFile $package}
if((Get-FileHash -LiteralPath $package).Hash -ine '90778deb1b77e36292828b4b5833c9255c27533f40e0ddd55891ae718944edc4'){throw 'WebView2 SDK package checksum mismatch'}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive=[IO.Compression.ZipFile]::OpenRead($package)
try{
 foreach($item in @(@('lib/net462/Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.Core.dll'),@('lib/net462/Microsoft.Web.WebView2.WinForms.dll','Microsoft.Web.WebView2.WinForms.dll'),@('build/native/x64/WebView2Loader.dll','WebView2Loader.dll'),@('LICENSE.txt','WebView2-LICENSE.txt'),@('NOTICE.txt','WebView2-NOTICE.txt'))){
  $entry=$archive.GetEntry($item[0]);if(-not $entry){throw 'WebView2 package entry missing'}
  $destination=Join-Path $Stage $item[1]
  [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,$destination,$true)
 }
}finally{$archive.Dispose()}
