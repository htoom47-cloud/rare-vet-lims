@echo off
chcp 65001 >nul
title تثبيت التشغيل التلقائي
cd /d "%~dp0"

set "AGENT_DIR=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "LINK=%STARTUP%\RareVet-Parasitology-Agent.bat"

(
echo @echo off
echo cd /d "%AGENT_DIR%"
echo node agent.js
) > "%LINK%"

echo.
echo تم — الوكيل سيعمل تلقائياً عند تشغيل Windows.
echo لا حاجة لفتح CMD أو localhost:3920 كل يوم.
echo.
echo الطريقة السهلة:
echo   1. أنشئ مجلداً لكل عينة داخل "صور الطفيليات"
echo      مثال: C:\Users\User\Desktop\صور الطفيليات\SMP-260623-022279
echo   2. احفظ الصورة من المجهر داخل هذا المجلد
echo   3. تُرفع تلقائياً الى LIMS
echo.
pause
