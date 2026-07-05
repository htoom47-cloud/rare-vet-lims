@echo off
chcp 65001 >nul
title تحميل وكيل الطفيليات من الشبكة
echo.
echo === تثبيت وكيل الطفيليات (بدون كلمة مرور) ===
echo.

set "URL=http://192.168.1.102:8765/parasitology-agent.zip"
set "DEST=C:\RareVet"
set "ZIP=%DEST%\parasitology-agent.zip"
set "DIR=%DEST%\parasitology-agent"

mkdir "%DEST%" 2>nul

echo [1/4] تحميل الملفات من جهاز dell...
powershell -NoProfile -Command "Invoke-WebRequest -Uri '%URL%' -OutFile '%ZIP%' -UseBasicParsing"
if errorlevel 1 (
  echo فشل التحميل. تأكد ان الجهازين على نفس الشبكة.
  pause
  exit /b 1
)

echo [2/4] فك الضغط...
powershell -NoProfile -Command "Expand-Archive -Path '%ZIP%' -DestinationPath '%DIR%' -Force"

echo [3/4] تثبيت المكتبات...
cd /d "%DIR%"
call npm.cmd install
if errorlevel 1 goto fail

echo [4/4] تشغيل الوكيل...
start "" cmd /k "cd /d %DIR% && START-AGENT.bat"
echo.
echo تم. افتح المتصفح: http://localhost:3920
timeout /t 8
exit /b 0

:fail
echo فشل التثبيت.
pause
exit /b 1
