@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title TECZEN 사내 마크 서버

rem ============================================================
rem  포트 · 월드 이름은 여기서 바꾼다
rem ============================================================
set "PORT=30000"
set "WORLD=teczen"
set "GAME=mineclonia"
set "APP=%~dp0app"

if not exist "%APP%\bin\luanti.exe" (
  echo 먼저 setup.cmd 를 실행하세요.
  pause & exit /b 1
)
if not exist "%APP%\games\%GAME%\game.conf" (
  echo 게임^(%GAME%^)이 설치되어 있지 않습니다.
  echo.
  echo   방법 1^) 브라우저로 https://codeberg.org/mineclonia/mineclonia/releases 에서 최신 [Source code ^(ZIP^)] 을 받아
  echo          %~dp0downloads 폴더에 넣고 setup.cmd 를 다시 실행
  echo   방법 2^) play.cmd - [Content/콘텐츠] - [Browse online content] - Mineclonia - [Install/설치]
  pause & exit /b 1
)
if not exist "%~dp0server.conf" copy /y "%~dp0server.conf.template" "%~dp0server.conf" >nul

echo.
echo ==========================================================
echo   TECZEN 사내 마크 서버를 켭니다   ^(게임: %GAME%, 월드: %WORLD%^)
echo ==========================================================
echo.
echo   직원 접속 주소  ^(Luanti - [Join Game/게임 참가] 탭에 입력^)
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do echo       주소:%%a     포트: %PORT%
echo       이 PC 에서 접속: 주소 127.0.0.1     포트: %PORT%
echo.
echo   끄기: 이 창에서 Ctrl+C  ^(월드는 자동 저장됩니다^)
echo   로그: %~dp0server.log
echo ----------------------------------------------------------
echo.

"%APP%\bin\luanti.exe" --server --console ^
  --config "%~dp0server.conf" ^
  --world "%APP%\worlds\%WORLD%" ^
  --gameid %GAME% ^
  --port %PORT% ^
  --logfile "%~dp0server.log"

echo.
echo 서버가 꺼졌습니다.
pause
