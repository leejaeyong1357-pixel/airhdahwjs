@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 가족관계증명서 → 엑셀 정리
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 가 없습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  pause ^& exit /b 1
)
if not exist node_modules\pdfjs-dist (
  echo 처음 실행이라 필요한 파일을 내려받습니다. 1~2분 걸릴 수 있습니다...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 ( echo 내려받기에 실패했습니다. 인터넷 연결을 확인하세요. ^& pause ^& exit /b 1 )
)
start "" http://localhost:2824
node server.js
pause
