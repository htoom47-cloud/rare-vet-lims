# Mindray BS-120 chemistry bridge — lab PC setup (port 5150, separate from Norma on 21110)
# Run: cd bridge\mindray  OR  cd C:\RareVet\mindray-bridge
#   .\configure-mindray-bridge.ps1
# Persistent (firewall + boot + watchdog) as Admin:
#   .\install-mindray-bridge.ps1

param(
  [string]$TargetDir = "C:\RareVet\mindray-bridge",
  [string]$SourceDir = $PSScriptRoot,
  [string]$LimsApi = "https://lims.rarevetcare.com/api",
  [string]$DeviceId = "",
  [string]$ApiKey = "",
  [int]$ListenPort = 5150,
  [switch]$Persistent
)

$ErrorActionPreference = "Stop"

function Get-LabIPv4 {
  $addrs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Sort-Object InterfaceMetric
  foreach ($a in $addrs) {
    if ($a.IPAddress -match '^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.') {
      return $a.IPAddress
    }
  }
  return ($addrs | Select-Object -First 1).IPAddress
}

function Install-PersistentExtras {
  param([string]$Dir, [int]$Port)

  Write-Host "Windows firewall rule (port $Port)..." -ForegroundColor Gray
  $fwName = "Rare Vet Mindray Bridge TCP $Port"
  if (-not (Get-NetFirewallRule -DisplayName $fwName -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName $fwName -Direction Inbound -Protocol TCP -LocalPort $Port -Action Allow | Out-Null
  }

  Write-Host "PM2 startup on Windows boot..." -ForegroundColor Gray
  npm install -g pm2 pm2-windows-startup 2>$null
  pm2-startup install 2>$null

  $watchdog = Join-Path $Dir "mindray-watchdog.ps1"
  $taskName = "RareVet-MindrayBridge-Watchdog"
  Write-Host "Scheduled task: $taskName (every 10 min)..." -ForegroundColor Gray
  $action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdog`""
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).Date -RepetitionInterval (New-TimeSpan -Minutes 10) `
    -RepetitionDuration (New-TimeSpan -Days 3650)
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
  Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings `
    -RunLevel Highest -Force | Out-Null

  $logsDir = Join-Path $Dir "logs"
  if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }
}

Write-Host ""
Write-Host "=== Mindray BS-120 Bridge - lab setup (port $ListenPort) ===" -ForegroundColor Cyan
Write-Host ""

if (-not (Test-Path $SourceDir)) {
  Write-Host "Source folder not found: $SourceDir" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $TargetDir)) {
  New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null
  Write-Host "Created $TargetDir" -ForegroundColor Gray
}

$files = @(
  "mindray-listener.js",
  "ecosystem.mindray.config.cjs",
  "package.json",
  "configure-mindray-bridge.ps1",
  "install-mindray-bridge.ps1",
  "mindray-watchdog.ps1",
  "verify-mindray-bridge.ps1",
  "start-mindray-bridge.bat",
  "mindray-bridge.env.example",
  "README.md"
)
$sourceResolved = (Resolve-Path $SourceDir -ErrorAction SilentlyContinue).Path
$targetResolved = (Resolve-Path $TargetDir -ErrorAction SilentlyContinue).Path
$skipCopy = $sourceResolved -and $targetResolved -and ($sourceResolved -eq $targetResolved)

if ($skipCopy) {
  Write-Host "Source and target are the same folder - skipping file copy" -ForegroundColor Gray
} else {
  foreach ($f in $files) {
    $src = Join-Path $SourceDir $f
    if (Test-Path $src) {
      Copy-Item $src (Join-Path $TargetDir $f) -Force
    }
  }
}

$envPath = Join-Path $TargetDir "mindray-bridge.env"
$existing = @{}
if (Test-Path $envPath) {
  Get-Content $envPath | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $existing[$matches[1].Trim()] = $matches[2].Trim()
    }
  }
}

if (-not $DeviceId) { $DeviceId = $existing["DEVICE_ID"] }
if (-not $ApiKey) { $ApiKey = $existing["DEVICE_API_KEY"] }
if ($existing["LIMS_API_URL"]) { $LimsApi = $existing["LIMS_API_URL"] }

if (-not $DeviceId -or -not $ApiKey -or $DeviceId -match "your-" -or $ApiKey -match "your-") {
  Write-Host "DEVICE_ID and DEVICE_API_KEY required." -ForegroundColor Yellow
  Write-Host "Run on server: cd backend && node src/scripts/setup-mindray-device.js" -ForegroundColor Yellow
  if (-not $DeviceId) { $DeviceId = Read-Host "DEVICE_ID" }
  if (-not $ApiKey) { $ApiKey = Read-Host "DEVICE_API_KEY" }
}

$envContent = @"
LIMS_API_URL=$LimsApi
DEVICE_ID=$DeviceId
DEVICE_API_KEY=$ApiKey
LISTEN_PORT=$ListenPort
"@
Set-Content -Path $envPath -Value $envContent -Encoding UTF8
Write-Host "Wrote mindray-bridge.env" -ForegroundColor Green

Set-Location $TargetDir
if (-not (Test-Path "node_modules")) {
  if (Test-Path "package.json") { npm install 2>$null }
}

$logsDir = Join-Path $TargetDir "logs"
if (-not (Test-Path $logsDir)) { New-Item -ItemType Directory -Path $logsDir -Force | Out-Null }

Write-Host "Installing / restarting PM2 (mindray-bridge only)..." -ForegroundColor Gray
npm install -g pm2 pm2-windows-startup 2>$null
pm2 delete mindray-bridge 2>$null | Out-Null
pm2 start "$TargetDir\ecosystem.mindray.config.cjs"
pm2 save

if ($Persistent) {
  Install-PersistentExtras -Dir $TargetDir -Port $ListenPort
}

$labIp = Get-LabIPv4
Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host ""
Write-Host "Lab PC IPv4 (Mindray LIS IP): $labIp" -ForegroundColor Yellow
Write-Host "Mindray LIS port: $ListenPort" -ForegroundColor Yellow
Write-Host "Norma CBC uses port 21110 on the same PC - no conflict" -ForegroundColor Gray
Write-Host "LIMS API: $LimsApi" -ForegroundColor Gray
if ($Persistent) {
  Write-Host "Persistent: firewall + PM2 boot + watchdog every 10 min" -ForegroundColor Green
} else {
  Write-Host 'Tip: run as Admin: .\install-mindray-bridge.ps1 for 24/7 auto-recovery' -ForegroundColor Yellow
}
Write-Host ""
Write-Host 'Mindray BS-120 settings (Setup / System / LIS):' -ForegroundColor Cyan
Write-Host "  Enable LIS: ON"
Write-Host "  LIS Host IP: $labIp  (NOT 127.0.0.1)"
Write-Host "  Port: $ListenPort"
Write-Host "  Connect to LIS When Started Up: ON"
Write-Host "  Bidirectional Mode: OFF"
Write-Host ""
Write-Host "Test Correspondence (Code On LIS):" -ForegroundColor Cyan
Write-Host "  Glu=GLU  Urea=BUN  Crea=CREA  AST=AST  ALT=ALT  ALP=ALP  T.P=TP"
Write-Host ""
Write-Host "Verify:" -ForegroundColor Cyan
Write-Host "  .\verify-mindray-bridge.ps1"
Write-Host "  pm2 status"
Write-Host '  pm2 logs mindray-bridge --lines 15'
Write-Host ""
