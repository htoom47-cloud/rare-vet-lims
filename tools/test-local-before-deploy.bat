@echo off
title LIMS local test (before deploy)
set "TOOLS=%~dp0"
set "FRONT=%TOOLS%..\frontend"

echo [1/3] RAW bridge test...
node "%TOOLS%test-raw-send.js"
if %ERRORLEVEL% neq 0 (
  echo Start bridge first: "%TOOLS%start-lims-zebra-bridge.bat"
  pause
  exit /b 1
)

echo.
echo [2/3] Starting LIMS frontend on http://localhost:5173
echo       API: https://lims.rarevetcare.com/api
echo.
echo [3/3] In browser:
echo   - Open http://localhost:5173 and login
echo   - F12 -^> Console
echo   - Print a label
echo   - Look for: [LIMS-Zebra] RAW send via HTTP /write
echo   - Must NOT see window.print or "Labels"
echo.
cd /d "%FRONT%"
set VITE_API_URL=https://lims.rarevetcare.com/api
npm run dev
