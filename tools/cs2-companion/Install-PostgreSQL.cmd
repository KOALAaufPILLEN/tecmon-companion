@echo off
cd /d "%~dp0"
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" postgres-setup.mjs
) else (
  node postgres-setup.mjs
)
pause
