@echo off
setlocal
cd /d "%~dp0"
title 테크젠 크래프트 서버

rem 포트를 바꾸려면 아래 숫자만 바꾼다 (기본 25565)
set "PORT=25565"

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 가 없습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  pause & exit /b 1
)

echo.
echo 서버를 켭니다. 직원들은 아래에 나오는 주소를 크롬 · 엣지 주소창에 넣으면 됩니다.
echo 다른 PC 에서 접속이 안 되면 firewall.cmd 를 관리자 권한으로 실행하세요.
echo.
node server.js
echo.
echo 서버가 꺼졌습니다.
pause
