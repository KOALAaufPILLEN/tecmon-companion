@echo off
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  powershell -NoProfile -Command "Start-Process -FilePath '.\runtime\node.exe' -ArgumentList 'server.mjs','--open' -WorkingDirectory (Get-Location).Path -WindowStyle Hidden"
) else (
  node server.mjs --open
)
