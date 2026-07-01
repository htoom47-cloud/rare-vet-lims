@echo off
title Zebra Local Bridge (LIMS)
cd /d "%~dp0.."
echo Starting Zebra bridge on http://127.0.0.1:9100 -^> USB008
node tools\zebra-local-bridge.js
pause
