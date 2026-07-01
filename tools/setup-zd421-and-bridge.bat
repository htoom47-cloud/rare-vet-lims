@echo off
title ZD421 Full Setup
cd /d "%~dp0"
echo [1/3] TLS certificate for HTTPS bridge...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0generate-bridge-cert.ps1"
echo [2/3] Printer setup...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-printer-setup.ps1"
echo [3/3] Starting LIMS Zebra Bridge (HTTP 9100 + HTTPS 9101)...
start "LIMS Zebra Bridge" node "%~dp0zebra-local-bridge.js"
echo.
echo IMPORTANT: Open https://127.0.0.1:9101/default in Chrome and accept the certificate.
echo Then print from LIMS.
timeout /t 12
