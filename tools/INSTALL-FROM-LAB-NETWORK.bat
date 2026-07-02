@echo off
chcp 65001 >nul
title تثبيت طباعة Zebra من جهاز المعمل
echo.
echo === تثبيت LIMS Zebra Bridge (كمبيوتر الاستقبال) ===
echo.

set "URL=http://192.168.1.102:8766/reception-zebra.zip"
set "DEST=C:\RareVet"
set "ZIP=%DEST%\reception-zebra.zip"
set "DIR=%DEST%\zebra-bridge"

mkdir "%DEST%" 2>nul

echo [1/5] تحميل الملفات من جهاز المعمل 192.168.1.102 ...
powershell -NoProfile -Command "Invoke-WebRequest -Uri '%URL%' -OutFile '%ZIP%' -UseBasicParsing"
if errorlevel 1 (
  echo فشل التحميل. تأكد ان كمبيوتر الاستقبال على نفس الشبكة.
  pause
  exit /b 1
)

echo [2/5] فك الضغط...
powershell -NoProfile -Command "Expand-Archive -Path '%ZIP%' -DestinationPath '%DIR%' -Force"

where node >nul 2>&1
if errorlevel 1 (
  echo [3/5] تثبيت Node.js ...
  winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
) else (
  echo [3/5] Node.js موجود.
)

echo [4/5] إعداد الشهادة والاختصارات...
cd /d "%DIR%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%DIR%\install-reception-zebra.ps1"

echo [5/5] تشغيل Bridge...
start "" "%DIR%\start-zebra-bridge.bat"
echo.
echo تم. افتح https://lims.rarevetcare.com واضغط Ctrl+F5 ثم اطبع ملصقاً.
timeout /t 10
exit /b 0
