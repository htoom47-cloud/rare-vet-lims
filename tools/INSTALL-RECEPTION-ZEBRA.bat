@echo off
title Install LIMS Zebra Bridge (Reception PC)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-reception-zebra.ps1"
pause
