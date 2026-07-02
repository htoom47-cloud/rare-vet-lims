@echo off

title Test LIMS Bridge Print

cd /d "%~dp0"

node -e "const fs=require('fs');const https=require('https');const zpl=fs.readFileSync('sample-label-cbc.zpl','utf8');const body=JSON.stringify({device:{name:'LIMS Zebra Bridge'},data:zpl});const req=https.request({hostname:'127.0.0.1',port:9101,path:'/write',method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)},rejectUnauthorized:false},res=>{let d='';res.on('data',c=>d+=c);res.on('end',()=>{console.log('HTTP',res.statusCode,d);process.exit(res.statusCode===200?0:1);});});req.on('error',e=>{console.error(e.message);process.exit(1);});req.write(body);req.end();"

echo.

if %ERRORLEVEL%==0 (echo Label sent. Check printer.) else (echo Failed. Run start-lims-zebra-bridge.bat first.)

pause

