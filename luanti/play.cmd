@echo off
cd /d "%~dp0"
if not exist "%~dp0app\bin\luanti.exe" (
  echo 먼저 setup.cmd 를 실행하세요.
  pause & exit /b 1
)
rem 게임 화면을 연다. [Join Game/게임 참가] 탭에서 주소 127.0.0.1 / 포트 30000 으로 접속
start "" "%~dp0app\bin\luanti.exe"
