@echo off
rem Rebuild after source code changes, then start the server
cd /d "%~dp0"
call npm run build
if errorlevel 1 ( pause & exit /b 1 )
call start.bat
