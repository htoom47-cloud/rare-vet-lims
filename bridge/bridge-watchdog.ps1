# Restarts norma-bridge if port 21110 is down or PM2 process is offline.
# Installed by configure-lab-bridge.ps1 (Scheduled Task every 10 minutes).
param(
  [int]$Port = 21110,
  [string]$LogFile = ""
)

$ErrorActionPreference = "SilentlyContinue"
if (-not $LogFile) { $LogFile = Join-Path $PSScriptRoot "watchdog.log" }

function Write-Log($msg) {
  $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $msg"
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

$listening = [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)

$pm2Online = $false
$pm2Json = pm2 jlist 2>$null | ConvertFrom-Json
if ($pm2Json) {
  $app = $pm2Json | Where-Object { $_.name -eq "norma-bridge" } | Select-Object -First 1
  if ($app -and $app.pm2_env.status -eq "online") { $pm2Online = $true }
}

if ($listening -and $pm2Online) {
  exit 0
}

Write-Log "Watchdog: port=$Port listen=$listening pm2=$pm2Online -> restarting norma-bridge"
pm2 restart norma-bridge 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  $eco = Join-Path $PSScriptRoot "ecosystem.config.cjs"
  if (Test-Path $eco) {
    pm2 start $eco 2>&1 | Out-Null
    pm2 save 2>&1 | Out-Null
  }
}
Write-Log "Watchdog: restart issued"
