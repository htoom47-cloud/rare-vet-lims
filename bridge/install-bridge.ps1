# Norma Bridge auto-start with PM2
# Run: .\install-bridge.ps1

$ErrorActionPreference = "Stop"
$BridgeDir = $PSScriptRoot
Set-Location $BridgeDir

Write-Host ""
Write-Host "=== Rare Vet Norma Bridge - Auto Start Setup ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path "$BridgeDir\bridge.env")) {
  Copy-Item "$BridgeDir\bridge.env.example" "$BridgeDir\bridge.env"
  Write-Host "Created bridge.env - edit DEVICE_ID and DEVICE_API_KEY from LIMS Devices page" -ForegroundColor Yellow
  notepad "$BridgeDir\bridge.env"
  Read-Host "Press Enter after saving bridge.env"
}

$envContent = Get-Content "$BridgeDir\bridge.env" -Raw
if ($envContent -match "your-device-uuid" -or $envContent -match "your-api-key") {
  Write-Host "Error: bridge.env still has example values. Edit it first." -ForegroundColor Red
  exit 1
}

Write-Host "Installing PM2..." -ForegroundColor Gray
npm install -g pm2 pm2-windows-startup 2>$null

Write-Host "Enable startup on Windows boot..." -ForegroundColor Gray
pm2-startup install 2>$null

$ErrorActionPreference = "Continue"
pm2 delete norma-bridge 2>$null | Out-Null
pm2 start "$BridgeDir\ecosystem.config.cjs"
if ($LASTEXITCODE -ne 0) {
  Write-Host "Error: pm2 start failed. Check bridge.env values." -ForegroundColor Red
  exit 1
}
pm2 save
$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "Done! Bridge is running in background." -ForegroundColor Green
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Cyan
Write-Host "  pm2 status"
Write-Host "  pm2 logs norma-bridge"
Write-Host "  pm2 restart norma-bridge"
Write-Host "  pm2 stop norma-bridge"
Write-Host ""
