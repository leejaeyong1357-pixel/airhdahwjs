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

rem Rebuild automatically when the code has changed since the last build
set HEAD=none
for /f "delims=" %%i in ('git rev-parse HEAD 2^>nul') do set HEAD=%%i
set BUILT=
if exist dist\.built-commit set /p BUILT=<dist\.built-commit

if not exist dist\server\server.js goto build
if "%HEAD%"=="none" goto serve
if not "%HEAD%"=="%BUILT%" goto build
goto serve

:build
echo Building app...
call npm run build
if errorlevel 1 ( pause & exit /b 1 )
>dist\.built-commit echo %HEAD%

:serve
echo.
echo Server starting at http://localhost:2222
echo To stop the server, close this window or press Ctrl+C
echo.
start "" http://localhost:2222
node scripts\serve-node.mjs
pause
