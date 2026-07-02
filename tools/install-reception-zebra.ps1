# Install LIMS Zebra Bridge on reception PC -> C:\RareVet\zebra-bridge
# Run from the copied "tools" folder (USB or network). Needs Node.js on this PC.

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$dest = 'C:\RareVet\zebra-bridge'

$files = @(
  'zebra-local-bridge.js',
  'send-zebra-raw.ps1',
  'generate-bridge-cert.ps1',
  'trust-bridge-cert.ps1',
  'sample-label-cbc.zpl'
)

Write-Host ''
Write-Host '=== LIMS Zebra Bridge — Reception PC install ===' -ForegroundColor Cyan
Write-Host ''

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '[!] Node.js not found. Install from https://nodejs.org (LTS) then run this script again.' -ForegroundColor Red
  exit 1
}

if (-not (Test-Path (Join-Path $src 'zebra-local-bridge.js'))) {
  Write-Host "[!] Missing zebra-local-bridge.js in $src" -ForegroundColor Red
  Write-Host '    Copy the whole tools folder from the project to this PC first.' -ForegroundColor Yellow
  exit 1
}

New-Item -ItemType Directory -Path $dest -Force | Out-Null
foreach ($f in $files) {
  $from = Join-Path $src $f
  if (Test-Path $from) {
    Copy-Item $from (Join-Path $dest $f) -Force
    Write-Host "  copied $f"
  }
}

$startBat = @"
@echo off
title LIMS Zebra Bridge (Reception)
cd /d C:\RareVet\zebra-bridge
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0generate-bridge-cert.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0trust-bridge-cert.ps1"
echo.
echo Bridge: http://127.0.0.1:9100  https://127.0.0.1:9101
echo Leave this window open while printing labels from LIMS.
echo.
start "" "https://127.0.0.1:9101/"
node "%~dp0zebra-local-bridge.js"
pause
"@

$testPs1 = @'
$zplFile = Join-Path $PSScriptRoot 'sample-label-cbc.zpl'
if (-not (Test-Path $zplFile)) { throw "Missing $zplFile" }
$zpl = Get-Content $zplFile -Raw -Encoding ASCII
$body = @{ device = @{ name = 'LIMS Zebra Bridge' }; data = $zpl } | ConvertTo-Json -Compress
try {
  Invoke-RestMethod -Uri 'https://127.0.0.1:9101/write' -Method Post -Body $body -ContentType 'application/json'
  Write-Host 'Test label sent to Zebra OK.' -ForegroundColor Green
} catch {
  Write-Host 'Failed. Start start-zebra-bridge.bat first.' -ForegroundColor Red
  throw
}
'@

Set-Content -Path (Join-Path $dest 'start-zebra-bridge.bat') -Value $startBat -Encoding ASCII
Set-Content -Path (Join-Path $dest 'test-print.ps1') -Value $testPs1 -Encoding ASCII

$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'LIMS Zebra Bridge.lnk'
$wsh = New-Object -ComObject WScript.Shell
$sc = $wsh.CreateShortcut($shortcutPath)
$sc.TargetPath = Join-Path $dest 'start-zebra-bridge.bat'
$sc.WorkingDirectory = $dest
$sc.Description = 'LIMS label printing bridge'
$sc.Save()

Write-Host ''
Write-Host "Installed to $dest" -ForegroundColor Green
Write-Host 'Desktop shortcut: LIMS Zebra Bridge' -ForegroundColor Green
Write-Host ''
Write-Host 'Next steps:' -ForegroundColor Yellow
Write-Host '  1. Connect Zebra ZD421 via USB'
Write-Host '  2. Double-click "LIMS Zebra Bridge" on desktop (keep window open)'
Write-Host '  3. Open https://lims.rarevetcare.com and press Ctrl+F5'
Write-Host '  4. Test: powershell -File C:\RareVet\zebra-bridge\test-print.ps1'
Write-Host ''
Read-Host 'Press Enter to close'
