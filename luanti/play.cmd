@echo off
setlocal
cd /d "%~dp0"
title Luanti 게임
if not exist "%~dp0app\bin\luanti.exe" (
  echo 먼저 setup.cmd 를 실행하세요.
  pause & exit /b 1
)
echo.
echo 게임 화면을 여는 중입니다... 몇 초 걸릴 수 있습니다.
echo 이 창은 게임을 끌 때까지 열려 있습니다. 닫지 마세요.
echo.
echo   접속: [Join Game/게임 참가] 탭 - 주소 127.0.0.1 - 포트 30000
echo.
"%~dp0app\bin\luanti.exe" --logfile "%~dp0client.log"
set "CODE=%errorlevel%"
echo.
echo 게임이 종료되었습니다. (종료 코드 %CODE%)
findstr /i /c:"ERROR[" "%~dp0client.log" >nul 2>&1
if errorlevel 1 goto :done
echo.
echo ---------------- 오류 기록 (client.log) ----------------
findstr /i /c:"ERROR[" "%~dp0client.log"
echo ---------------------------------------------------------
echo 이 화면을 찍어서 보내 주세요.
:done
echo.
pause
