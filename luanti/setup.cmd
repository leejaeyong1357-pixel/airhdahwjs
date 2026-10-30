@echo off
setlocal EnableExtensions EnableDelayedExpansion
cd /d "%~dp0"
title TECZEN 사내 마크 서버 - 설치

rem ============================================================
rem  Luanti(옛 Minetest) + Mineclonia(마인크래프트와 거의 같은 게임) 설치
rem  - 엔진 버전을 바꾸려면 아래 VER 만 고치면 된다
rem ============================================================
set "VER=5.18.0"
set "ZIPNAME=luanti-%VER%-win64.zip"
set "ENGINE_URL=https://github.com/luanti-org/luanti/releases/download/%VER%/%ZIPNAME%"
set "GAME_URL=https://content.luanti.org/packages/ryvnf/mineclonia/download/"
set "HERE=%~dp0"
set "APP=%HERE%app"
set "DL=%HERE%downloads"
set "TMPX=%HERE%_tmp"

echo.
echo ==========================================================
echo   TECZEN 사내 마크 서버 설치 (Luanti %VER% + Mineclonia)
echo ==========================================================
echo.

where curl >nul 2>&1 || (echo [오류] curl 이 없습니다. Windows 10 이상에서 실행하세요. & goto :fail)
where tar  >nul 2>&1 || (echo [오류] tar 가 없습니다. Windows 10 이상에서 실행하세요. & goto :fail)
if not exist "%DL%" mkdir "%DL%"

rem ── 1. 엔진 ──────────────────────────────────────────────
if exist "%APP%\bin\luanti.exe" (
  echo [1/4] 엔진: 이미 설치되어 있습니다. ^(app 폴더^)
) else (
  if not exist "%DL%\%ZIPNAME%" (
    echo [1/4] 엔진 내려받는 중... ^(약 17MB^)
    curl -L --fail -o "%DL%\%ZIPNAME%" "%ENGINE_URL%"
    if errorlevel 1 (
      del "%DL%\%ZIPNAME%" >nul 2>&1
      echo.
      echo [오류] 엔진을 내려받지 못했습니다. 회사망에서 GitHub 이 막혔을 수 있습니다.
      echo   브라우저로 아래 주소의 파일을 받아서
      echo     %ENGINE_URL%
      echo   이 폴더에 넣고 setup.cmd 를 다시 실행하세요:
      echo     %DL%
      goto :fail
    )
  ) else (
    echo [1/4] 엔진: downloads 폴더의 %ZIPNAME% 를 사용합니다.
  )
  if exist "%TMPX%" rmdir /s /q "%TMPX%"
  mkdir "%TMPX%"
  tar -xf "%DL%\%ZIPNAME%" -C "%TMPX%"
  if errorlevel 1 (echo [오류] 압축을 풀지 못했습니다. 파일이 깨졌을 수 있으니 downloads 폴더의 zip 을 지우고 다시 실행하세요. & goto :fail)
  move "%TMPX%\luanti-%VER%-win64" "%APP%" >nul
  rmdir /s /q "%TMPX%"
  if not exist "%APP%\bin\luanti.exe" (echo [오류] 설치 후에도 luanti.exe 가 없습니다. & goto :fail)
  echo       완료: %APP%
)

rem ── 2. 게임 (Mineclonia) ──────────────────────────────────
if exist "%APP%\games\mineclonia\game.conf" (
  echo [2/4] 게임: Mineclonia 가 이미 설치되어 있습니다.
) else (
  echo [2/4] 게임 Mineclonia 내려받는 중...
  curl -L --fail -o "%DL%\mineclonia.zip" "%GAME_URL%"
  if errorlevel 1 (
    del "%DL%\mineclonia.zip" >nul 2>&1
    echo.
    echo [안내] Mineclonia 를 자동으로 받지 못했습니다. 회사망에서 content.luanti.org 가 막혔을 수 있습니다.
    echo   play.cmd 로 게임 화면을 연 뒤
    echo     [Content/콘텐츠] - [Browse online content] - Mineclonia 검색 - [Install/설치]
    echo   를 누르면 같은 곳에 설치됩니다. 그 다음 start-server.cmd 를 실행하세요.
    echo.
  ) else (
    if exist "%TMPX%" rmdir /s /q "%TMPX%"
    mkdir "%TMPX%"
    tar -xf "%DL%\mineclonia.zip" -C "%TMPX%"
    set "GAMEDIR="
    if exist "%TMPX%\game.conf" set "GAMEDIR=%TMPX%"
    for /d %%D in ("%TMPX%\*") do if exist "%%D\game.conf" set "GAMEDIR=%%D"
    if not defined GAMEDIR (echo [오류] 받은 파일에서 게임을 찾지 못했습니다. & goto :fail)
    if not exist "%APP%\games" mkdir "%APP%\games"
    if "!GAMEDIR!"=="%TMPX%" (
      move "%TMPX%" "%APP%\games\mineclonia" >nul
    ) else (
      move "!GAMEDIR!" "%APP%\games\mineclonia" >nul
      rmdir /s /q "%TMPX%"
    )
    echo       완료: %APP%\games\mineclonia
  )
)

rem ── 3. 서버 설정 ──────────────────────────────────────────
rem   (닉네임을 다시 묻는 반복은 괄호 블록 밖에 둬야 cmd 가 제대로 처리한다)
if exist "%HERE%server.conf" (
  echo [3/4] 서버 설정: server.conf 가 이미 있습니다. ^(그대로 둡니다^)
  goto :step4
)
copy /y "%HERE%server.conf.template" "%HERE%server.conf" >nul
echo [3/4] 서버 설정 파일을 만들었습니다: server.conf
echo.
echo   서버 관리자로 쓸 게임 닉네임을 정하세요.
echo   영문 · 숫자 · _ · - 만 됩니다. (예: admin, TZ82211489)
:askname
set "ADMIN="
set /p "ADMIN=  관리자 닉네임: "
if not defined ADMIN goto :askname
echo !ADMIN!| findstr /r /x "[A-Za-z0-9_-]*" >nul || (echo   영문 · 숫자 · _ · - 만 쓸 수 있습니다. & goto :askname)
>>"%HERE%server.conf" echo.
>>"%HERE%server.conf" echo # 서버 관리자 (이 닉네임으로 접속하면 모든 권한)
>>"%HERE%server.conf" echo name = !ADMIN!
echo   관리자 닉네임: !ADMIN!

:step4
rem ── 4. 직원용 내려받기 파일 (AX LAB 사이트에서 받을 수 있게) ──
set "PUB=%HERE%..\public\downloads"
if exist "%DL%\%ZIPNAME%" (
  if not exist "%PUB%" mkdir "%PUB%"
  copy /y "%DL%\%ZIPNAME%" "%PUB%\luanti-win64.zip" >nul
  echo [4/4] 직원용 설치파일 복사: public\downloads\luanti-win64.zip
  echo       AX LAB 서버가 켜져 있으면 직원은 http://^<이 PC 주소^>:2222/downloads/luanti-win64.zip 으로 받습니다.
) else (
  echo [4/4] 직원용 설치파일: 건너뜀
)

echo.
echo ==========================================================
echo   설치 끝. 서버 켜기:  start-server.cmd
echo   이 PC 에서 같이 하기: play.cmd
echo ==========================================================
echo.
pause
exit /b 0

:fail
echo.
echo 설치를 마치지 못했습니다. 위 안내를 확인하세요.
pause
exit /b 1
