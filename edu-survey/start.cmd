@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 26년도 교육 만족도 조사 (포트 2821)
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 가 없습니다. https://nodejs.org 에서 LTS 버전을 설치한 뒤 다시 실행하세요.
  pause ^& exit /b 1
)
node server.js
pause
