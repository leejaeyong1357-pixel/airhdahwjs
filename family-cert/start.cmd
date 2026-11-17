@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PDF OCR - 가족관계증명서 엑셀 정리
rem 배포용 묶음에는 node.exe 가 같이 들어 있다. 있으면 그것을 쓰고, 없으면 PC에 설치된 Node.js 를 쓴다.
set "NODE=node"
if exist "%~dp0node.exe" set "NODE=%~dp0node.exe"
if "%NODE%"=="node" (
  where node >nul 2>&1
  if errorlevel 1 (
    echo Node.js 가 없습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
    pause
    exit /b 1
  )
)
if not exist node_modules\onnxruntime-web (
  echo 필요한 파일을 내려받습니다. 1~2분 걸릴 수 있습니다...
  call npm install --omit=dev --no-audit --no-fund
  if errorlevel 1 (
    echo 내려받기에 실패했습니다. 인터넷 연결을 확인하세요.
    pause
    exit /b 1
  )
)
start "" http://localhost:2824
rem H Chat(사내 AI)을 쓸 때 사내 인증서를 믿도록, 가능한 Node 버전이면 Windows 인증서 저장소를 쓴다
"%NODE%" --use-system-ca -e "" >nul 2>&1
if errorlevel 1 ( "%NODE%" server.js ) else ( "%NODE%" --use-system-ca server.js )
pause
