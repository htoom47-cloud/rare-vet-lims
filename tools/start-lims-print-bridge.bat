@echo off
title LIMS Print Bridge - Zebra + Epson
cd /d "%~dp0"
set "PATH=C:\Program Files\nodejs;%PATH%"

if not exist "node_modules\pdf-to-printer" (
  echo Epson print support is not installed.
  echo Run setup-lims-print-bridge.ps1 once, then try again.
  if /I not "%LIMS_BRIDGE_SILENT%"=="1" pause
  exit /b 1
)

echo LIMS Print Bridge
echo Zebra: RAW ZPL barcodes
echo Epson: silent 80mm invoices
echo HTTP  http://127.0.0.1:9100
echo HTTPS https://127.0.0.1:9101
echo Keep this window open while printing from LIMS.
echo.
node zebra-local-bridge.js
set ERR=%ERRORLEVEL%
if /I not "%LIMS_BRIDGE_SILENT%"=="1" pause
exit /b %ERR%
