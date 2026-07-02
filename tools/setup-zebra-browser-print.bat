@echo off
title Zebra Browser Print setup for LIMS
echo.
echo ========================================
echo  LIMS + Zebra ZD421 (without LIMS bridge)
echo ========================================
echo.
echo LIMS needs Zebra Browser Print on this PC (official Zebra app).
echo It starts automatically with Windows - no manual bridge window.
echo.

netstat -ano | findstr ":9100 " | findstr LISTENING >nul
if %ERRORLEVEL%==0 (
  echo [OK] Zebra Browser Print service is running on port 9100.
) else (
  echo [!] Zebra Browser Print is NOT running.
  echo     Download and install from Zebra website:
  echo     https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html
  echo.
  start "" "https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html"
)

echo.
echo Step 1: Install ZebraBrowserPrintSetup.exe if not installed
echo Step 2: Accept SSL certificate in browser:
start "" "https://localhost:9101/ssl_support"
echo.
echo Step 3: In Browser Print tray icon - allow website:
echo         lims.rarevetcare.com
echo.
echo Step 4: Test print:
cd /d "%~dp0"
if exist test-lims-bridge-print.bat (
  echo         Close LIMS bridge if running - use Browser Print only.
)
echo         Print a label from LIMS (Ctrl+F5 first)
echo.
pause
