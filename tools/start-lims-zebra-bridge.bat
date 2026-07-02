@echo off
title LIMS Zebra Bridge
cd /d "C:\Users\dell\Projects\rare-vet-lims\tools"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0generate-bridge-cert.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0trust-bridge-cert.ps1"
echo.
echo Starting bridge HTTP:9100 + HTTPS:9101 ...
start "" "https://127.0.0.1:9101/"
node "%~dp0zebra-local-bridge.js"
pause
