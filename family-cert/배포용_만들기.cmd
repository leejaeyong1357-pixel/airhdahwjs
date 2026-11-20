@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 배포용 묶음 만들기
rem 다른 PC에 건넬 "설치 없이 압축만 풀면 되는" 묶음을 만든다.
rem   결과: portable\family-cert\ 폴더와 portable\family-cert-portable.zip
rem   들어가는 것: 프로그램 + 꼭 필요한 부품 + node.exe   /   안 들어가는 것: API 키(data 폴더), 넣었던 증명서
if not exist node_modules\onnxruntime-web (
  echo 먼저 start.cmd 를 한 번 실행해서 필요한 파일을 내려받은 뒤 다시 해 주세요.
  pause
  exit /b 1
)
set "NODEEXE="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODEEXE set "NODEEXE=%%i"
if not defined NODEEXE (
  echo 이 PC에 Node.js 가 없어 node.exe 를 넣을 수 없습니다.
  pause
  exit /b 1
)
set "OUT=%~dp0portable\family-cert"
set "NM=%OUT%\node_modules"
set "Q=/NFL /NDL /NJH /NJS /NP"
echo 묶음을 만드는 중...
if exist portable rmdir /s /q portable
mkdir "%OUT%"
copy /y server.js "%OUT%\" >nul
copy /y hchat.js "%OUT%\" >nul
copy /y package.json "%OUT%\" >nul
copy /y start.cmd "%OUT%\" >nul
copy /y README.md "%OUT%\" >nul
copy /y "%NODEEXE%" "%OUT%\node.exe" >nul
robocopy public "%OUT%\public" /E %Q% >nul
robocopy sample "%OUT%\sample" /E %Q% >nul
robocopy node_modules\pdfjs-dist\build "%NM%\pdfjs-dist\build" pdf.min.mjs pdf.worker.min.mjs %Q% >nul
robocopy node_modules\pdfjs-dist\cmaps "%NM%\pdfjs-dist\cmaps" /E %Q% >nul
robocopy node_modules\pdfjs-dist\standard_fonts "%NM%\pdfjs-dist\standard_fonts" /E %Q% >nul
robocopy node_modules\tesseract.js\dist "%NM%\tesseract.js\dist" tesseract.min.js worker.min.js %Q% >nul
robocopy node_modules\tesseract.js-core "%NM%\tesseract.js-core" tesseract-core-simd-lstm.wasm.js tesseract-core-lstm.wasm.js %Q% >nul
robocopy "node_modules\@tesseract.js-data\kor\4.0.0_best_int" "%NM%\@tesseract.js-data\kor\4.0.0_best_int" kor.traineddata.gz %Q% >nul
robocopy node_modules\exceljs\dist "%NM%\exceljs\dist" exceljs.min.js %Q% >nul
robocopy node_modules\onnxruntime-web\dist "%NM%\onnxruntime-web\dist" ort.wasm.min.js ort-wasm-simd-threaded.mjs ort-wasm-simd-threaded.wasm %Q% >nul
robocopy "node_modules\@gutenye\ocr-models\assets" "%NM%\@gutenye\ocr-models\assets" ch_PP-OCRv4_rec_infer.onnx ppocr_keys_v1.txt %Q% >nul
if not exist "%NM%\onnxruntime-web\dist\ort.wasm.min.js" (
  echo 부품을 복사하지 못했습니다. 이 창의 내용을 알려 주세요.
  pause
  exit /b 1
)
echo 압축하는 중...
powershell -NoProfile -Command "Compress-Archive -Path '%OUT%' -DestinationPath '%~dp0portable\family-cert-portable.zip' -Force"
echo.
echo 다 됐습니다.
echo   건넬 파일: %~dp0portable\family-cert-portable.zip
echo   받는 사람: 압축을 풀고 family-cert 폴더 안의 start.cmd 를 더블클릭
echo   (API 키는 들어 있지 않습니다. 받는 사람이 자기 키를 넣어야 합니다.)
start "" "%~dp0portable"
pause
