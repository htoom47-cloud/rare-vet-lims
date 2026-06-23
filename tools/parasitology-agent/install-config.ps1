# Run on parasitology PC: right-click → Run with PowerShell
# Or: powershell -ExecutionPolicy Bypass -File install-config.ps1

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $dir 'config.json'
$watchDir = 'C:\Users\User\Desktop\صور الطفيليات'

if (-not (Test-Path $watchDir)) {
  New-Item -ItemType Directory -Path $watchDir -Force | Out-Null
  Write-Host "Created folder: $watchDir"
}

& node (Join-Path $dir 'setup.js') $watchDir
Write-Host "Saved: $configPath"
Write-Host "Run: npm start"
