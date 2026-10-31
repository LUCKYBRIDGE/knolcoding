@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 LTS is required.
  echo Install it from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

node ".\scripts\start-local.mjs"
if errorlevel 1 pause

endlocal
