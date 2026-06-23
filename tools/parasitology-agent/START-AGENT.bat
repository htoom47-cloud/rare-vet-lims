@echo off
chcp 65001 >nul
title Rare Vet - Parasitology Agent Setup
cd /d "%~dp0"

echo === Rare Vet Parasitology Agent ===
echo.

if not exist node_modules (
  echo Installing dependencies...
  call npm.cmd install
  if errorlevel 1 goto fail
)

mkdir "C:\Users\User\Desktop\صور الطفيليات" 2>nul

echo Creating config.json...
node -e "const fs=require('fs');const c={apiUrl:'https://rare-vet-lims.onrender.com/api',username:'admin',password:'Htoome449944@',watchDir:'C:\\Users\\User\\Desktop\\صور الطفيليات',panel:'blood',localPort:3920,deleteAfterUpload:false,moveAfterUpload:false,uploadedDir:'uploaded'};fs.writeFileSync('config.json',JSON.stringify(c,null,2),'utf8');console.log('config.json created OK');"

if errorlevel 1 goto fail

echo.
echo Starting agent... Open http://localhost:3920 in your browser
echo Keep this window OPEN. Press Ctrl+C to stop.
echo.
call npm.cmd start
goto end

:fail
echo.
echo Setup failed. Make sure Node.js is installed: https://nodejs.org
pause
exit /b 1

:end
