@echo off
chcp 65001 >nul
cd /d "%~dp0"
mkdir "C:\Users\User\Desktop\صور الطفيليات" 2>nul
node -e "const fs=require('fs');const c={apiUrl:'https://rare-vet-lims.onrender.com/api',username:'admin',password:'CHANGE_ME',watchDir:'C:\\Users\\User\\Desktop\\صور الطفيليات',panel:'blood',localPort:3920,deleteAfterUpload:false,moveAfterUpload:false,uploadedDir:'uploaded'};fs.writeFileSync('config.json',JSON.stringify(c,null,2),'utf8');console.log('config.json OK');"
if errorlevel 1 (
  echo Node failed. Install Node.js from https://nodejs.org
  pause
  exit /b 1
)
echo.
echo Edit password: notepad config.json
echo Then run: npm start
pause
