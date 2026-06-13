@echo off
title Rare Vet - Norma Bridge
cd /d "%~dp0"

if not exist bridge.env (
  echo.
  echo [خطأ] ملف bridge.env غير موجود
  echo انسخ bridge.env.example الى bridge.env وعدّل القيم
  echo.
  pause
  exit /b 1
)

for /f "usebackq eol=# tokens=1,* delims==" %%a in ("bridge.env") do (
  set "%%a=%%b"
)

echo [Norma Bridge] Starting on port %LISTEN_PORT%...
node norma-listener.js
