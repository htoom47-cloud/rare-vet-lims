# Run on parasitology PC: right-click → Run with PowerShell
# Or: powershell -ExecutionPolicy Bypass -File install-config.ps1

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $dir 'config.json'
$watchDir = 'C:\Users\User\Desktop\صور الطفيليات'

if (-not (Test-Path $watchDir)) {
  New-Item -ItemType Directory -Path $watchDir -Force | Out-Null
  Write-Host "Created folder: $watchDir"
}

$config = @{
  apiUrl = 'https://rare-vet-lims.onrender.com/api'
  username = 'admin'
  password = 'CHANGE_ME'
  watchDir = $watchDir
  panel = 'blood'
  localPort = 3920
  deleteAfterUpload = $false
  moveAfterUpload = $false
  uploadedDir = 'uploaded'
} | ConvertTo-Json

Set-Content -Path $configPath -Value $config -Encoding UTF8
Write-Host "Saved: $configPath"
Write-Host "Edit password in config.json if needed, then run: npm start"
