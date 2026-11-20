@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Luanti 게임

set "EXE=%~dp0app\bin\luanti.exe"
set "CONF=%~dp0client.conf"
set "LOG=%~dp0client.log"
if not exist "%EXE%" (
  echo 먼저 setup.cmd 를 실행하세요.
  pause & exit /b 1
)
rem 게임 설정은 client.conf 에 저장된다 (그래픽 방식 등)
if not exist "%CONF%" type nul > "%CONF%"

echo.
echo 게임 화면을 여는 중입니다... 몇 초 걸릴 수 있습니다.
echo 이 창은 게임을 끌 때까지 열려 있습니다. 닫지 마세요.
echo.
echo   접속: [Join Game/게임 참가] 탭 - 주소 127.0.0.1 - 포트 30000
echo.

set "TRY=0"
:run
set /a TRY+=1
"%EXE%" --config "%CONF%" --logfile "%LOG%"
set "CODE=%errorlevel%"
if "%CODE%"=="0" goto :ok

echo.
echo [!] 게임이 비정상 종료되었습니다. (종료 코드 %CODE%)
call :showlog
if %TRY% GEQ 3 goto :giveup

rem 회사 PC 그래픽 드라이버에서 기본 방식(opengl3)이 안 되면 다른 방식으로 다시 시도
if %TRY%==1 (set "DRV=opengl") else (set "DRV=ogles2")
echo.
echo 그래픽 방식을 [%DRV%] 로 바꿔서 다시 실행합니다...
call :setdriver %DRV%
goto :run

:ok
echo.
echo 게임을 정상 종료했습니다.
pause
exit /b 0

:giveup
echo.
echo ==========================================================
echo  그래픽 방식을 3가지 모두 시도했지만 실행되지 않았습니다.
echo  - 원격 데스크톱^(RDP^)으로 접속한 PC 라면 실제 PC 앞에서 실행하세요.
echo  - 그래픽 드라이버가 오래됐으면 업데이트가 필요합니다.
echo  - 회사 보안 프로그램^(화면 워터마크 · DRM 등^)이 게임을 막는 경우가 있습니다.
echo    이때는 전산팀에 luanti.exe 예외 등록을 요청하세요.
echo  위 로그 화면을 찍어서 보내 주세요.
echo ==========================================================
rem 다음 실행은 기본 방식부터 다시 시도하도록 되돌린다
call :setdriver
pause
exit /b 1

rem ── 로그 마지막 15줄 ─────────────────────────────────────
:showlog
if not exist "%LOG%" exit /b 0
set "N=0"
for /f %%n in ('find /c /v "" ^< "%LOG%"') do set "N=%%n"
set /a SKIP=N-15
if %SKIP% LSS 0 set "SKIP=0"
echo ----------------- client.log 마지막 부분 -----------------
more +%SKIP% "%LOG%"
echo -----------------------------------------------------------
exit /b 0

rem ── client.conf 의 그래픽 방식 바꾸기 (값이 없으면 기본으로) ──
:setdriver
findstr /v /b /c:"video_driver" "%CONF%" > "%CONF%.tmp"
if not "%~1"=="" >>"%CONF%.tmp" echo video_driver = %~1
move /y "%CONF%.tmp" "%CONF%" >nul
exit /b 0
