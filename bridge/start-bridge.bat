@echo off
chcp 65001 >nul
title Rare Vet - Norma Bridge
cd /d "%~dp0"

if not exist bridge.env (
  echo.
  echo [ERROR] bridge.env not found
  echo Copy bridge.env.example to bridge.env and set DEVICE_ID / DEVICE_API_KEY
  echo.
  pause
  exit /b 1
)

for /f "usebackq eol=# tokens=1,* delims==" %%a in ("bridge.env") do (
  set "%%a=%%b"
)

echo [Norma Bridge] Starting on port %LISTEN_PORT%...
node norma-listener.js
