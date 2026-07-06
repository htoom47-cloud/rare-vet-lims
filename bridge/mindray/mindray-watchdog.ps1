# Restarts mindray-bridge if port 5150 is down or PM2 process is offline.
param(
  [int]$Port = 5150,
  [string]$LogFile = ""
)

$ErrorActionPreference = "SilentlyContinue"
if (-not $LogFile) { $LogFile = Join-Path $PSScriptRoot "mindray-watchdog.log" }

function Write-Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

$listening = [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)

$pm2Online = $false
$pm2Json = pm2 jlist 2>$null | ConvertFrom-Json
if ($pm2Json) {
  $app = $pm2Json | Where-Object { $_.name -eq "mindray-bridge" } | Select-Object -First 1
  if ($app -and $app.pm2_env.status -eq "online") { $pm2Online = $true }
}

if ($listening -and $pm2Online) {
  exit 0
}

Write-Log "Watchdog: port=$Port listen=$listening pm2=$pm2Online -> restarting mindray-bridge"
pm2 restart mindray-bridge 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  $eco = Join-Path $PSScriptRoot "ecosystem.mindray.config.cjs"
  if (Test-Path $eco) {
    pm2 start $eco 2>&1 | Out-Null
    pm2 save 2>&1 | Out-Null
  }
}
Write-Log "Watchdog: restart issued"
