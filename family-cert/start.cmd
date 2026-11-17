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
rem H Chat(사내 AI)을 쓸 때 사내 인증서를 믿도록, 가능한 Node 버전이면 Windows 인증서 저장소를 쓴다
node --use-system-ca -e "" >nul 2>&1
if errorlevel 1 ( node server.js ) else ( node --use-system-ca server.js )
pause
