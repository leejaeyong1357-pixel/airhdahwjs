@echo off
rem TECZEN server launcher - double click to start
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed. Download LTS from https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing packages... first run only
  call npm install --no-audit --no-fund
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist dist\server\server.js (
  echo Building app... first run only
  call npm run build
  if errorlevel 1 ( pause & exit /b 1 )
)

echo.
echo Server starting at http://localhost:3000
echo To stop the server, close this window or press Ctrl+C
echo.
start "" http://localhost:3000
node scripts\serve-node.mjs
pause
