@echo off
title Deploy Zebra Bridge to Reception (192.168.1.100)
cd /d "%~dp0"

echo.
echo === LIMS: Deploy to Reception PC ===
echo Reception: 192.168.1.100  (AnyDesk: 857868074)
echo Lab PC:    192.168.1.102
echo.

netstat -ano | findstr ":8766 " | findstr LISTENING >nul
if errorlevel 1 (
  echo Starting deploy server on port 8766...
  start "Zebra Deploy Server" /MIN cmd /c "node \"%~dp0serve-reception-deploy.js\""
  timeout /t 3 /nobreak >nul
)

echo.
echo Enter Windows password for reception user when prompted.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-reception-zebra.ps1" -Username "قنوش"
pause
