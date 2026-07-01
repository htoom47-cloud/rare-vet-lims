@echo off
title ZD421 Full Setup
cd /d "%~dp0"
echo Running ZD421 printer setup (SGD + calibrate + test)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-printer-setup.ps1"
echo.
echo Starting LIMS Zebra Bridge...
start "LIMS Zebra Bridge" /min node "%~dp0zebra-local-bridge.js"
echo Done. Check printer for OK label.
timeout /t 8
