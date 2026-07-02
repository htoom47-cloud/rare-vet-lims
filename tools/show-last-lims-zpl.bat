@echo off
title LIMS last ZPL from bridge
curl.exe -sk https://127.0.0.1:9101/debug/last
echo.
echo.
echo ZPL files folder:
echo %~dp0zpl-log
pause
