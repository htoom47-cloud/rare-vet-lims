@echo off
chcp 65001 >nul
title Rare Vet - Parasitology Agent Setup
cd /d "%~dp0"

echo === Rare Vet Parasitology Agent ===
echo.

if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 goto fail
)

mkdir "C:\Users\User\Desktop\صور الطفيليات" 2>nul

echo Creating config.json...
node setup.js

if errorlevel 1 goto fail

echo.
echo Starting agent... Open http://localhost:3920 in your browser
echo Keep this window OPEN. Press Ctrl+C to stop.
echo.
call npm.cmd start
goto end

:fail
echo.
echo Setup failed. Make sure Node.js is installed: https://nodejs.org
pause
exit /b 1

:end
