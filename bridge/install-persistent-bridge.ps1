# Permanent Norma bridge — run PowerShell AS ADMINISTRATOR once on the lab PC.
#   cd C:\RareVet\bridge
#   .\install-persistent-bridge.ps1
#
# Does: copy files, bridge.env, PM2, Windows startup, firewall, watchdog task.

param(
  [string]$TargetDir = "C:\RareVet\bridge",
  [string]$SourceDir = $PSScriptRoot,
  [string]$LimsApi = "https://lims.rarevetcare.com/api",
  [string]$DeviceId = "",
  [string]$ApiKey = "",
  [int]$ListenPort = 21110
)

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
if (-not $isAdmin) {
  Write-Host "Run PowerShell as Administrator for firewall + auto-start + watchdog." -ForegroundColor Red
  Write-Host "Right-click PowerShell -> Run as administrator" -ForegroundColor Yellow
  exit 1
}

$configure = Join-Path $SourceDir "configure-lab-bridge.ps1"
if (-not (Test-Path $configure)) {
  Write-Host "configure-lab-bridge.ps1 not found" -ForegroundColor Red
  exit 1
}

& $configure -TargetDir $TargetDir -SourceDir $SourceDir -LimsApi $LimsApi `
  -DeviceId $DeviceId -ApiKey $ApiKey -ListenPort $ListenPort -Persistent

Write-Host ""
Write-Host "Persistent setup complete. Reboot test recommended." -ForegroundColor Green
