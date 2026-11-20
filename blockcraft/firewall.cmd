@echo off
setlocal
cd /d "%~dp0"
title 테크젠 크래프트 방화벽 열기

rem 다른 직원 PC 에서 접속하려면 이 PC 방화벽에서 TCP 25565 를 열어야 한다.
net session >nul 2>&1
if errorlevel 1 (
  echo 관리자 권한이 필요합니다.
  echo 이 파일을 마우스 오른쪽 클릭 - [관리자 권한으로 실행] 하세요.
  pause & exit /b 1
)

netsh advfirewall firewall delete rule name="TECZEN Craft Server" >nul 2>&1
netsh advfirewall firewall add rule name="TECZEN Craft Server" dir=in action=allow protocol=TCP localport=25565
if errorlevel 1 (
  echo.
  echo 방화벽 규칙을 추가하지 못했습니다. 회사 보안 정책^(GPO^)으로 막혀 있을 수 있습니다.
  echo 전산팀에 "이 PC 의 TCP 25565 포트 수신 허용"을 요청하세요.
) else (
  echo.
  echo TCP 25565 포트를 열었습니다.
)
pause
