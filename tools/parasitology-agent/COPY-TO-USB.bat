@echo off
chcp 65001 >nul
title نسخ وكيل الطفيليات إلى فلاشة USB
cd /d "%~dp0"

echo.
echo === نسخ وكيل الطفيليات (بدون كلمة مرور) ===
echo.
echo 1) أدخل فلاشة USB
echo 2) اكتب حرف الفلاشة (مثل E أو F)
echo.
set /p DRIVE=حرف الفلاشة: 

if "%DRIVE%"=="" (
  echo لم تُدخل حرفاً.
  pause
  exit /b 1
)

set "DEST=%DRIVE%:\parasitology-agent"
echo.
echo النسخ إلى %DEST% ...
echo انتظر...

if not exist "%DEST%" mkdir "%DEST%"
robocopy "%~dp0" "%DEST%" /E /XD node_modules /NFL /NDL /NJH /NJS /nc /ns /np

echo.
echo ========================================
echo  تم النسخ بنجاح
echo ========================================
echo.
echo على كمبيوتر الطفيليات:
echo   1) انسخ مجلد parasitology-agent من الفلاشة الى:
echo      C:\RareVet\parasitology-agent
echo   2) افتح CMD واكتب:
echo      cd C:\RareVet\parasitology-agent
echo      npm install
echo      START-AGENT.bat
echo   3) افتح المتصفح: http://localhost:3920
echo.
pause
