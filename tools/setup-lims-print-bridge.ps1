$ErrorActionPreference = 'Stop'

$toolsDir = $PSScriptRoot
$packageFile = Join-Path $toolsDir 'package.json'
$startScript = Join-Path $toolsDir 'start-lims-print-bridge.bat'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'LIMS Print Bridge.lnk'
$legacyStartup = Join-Path $startupDir 'LIMS-Zebra-Bridge.vbs'

Write-Host 'Installing LIMS local print bridge...'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js is not installed or is not available in PATH.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm is not installed or is not available in PATH.'
}
if (-not (Test-Path $packageFile)) {
  throw "Missing package file: $packageFile"
}

Push-Location $toolsDir
try {
  npm install --omit=dev
  if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
} finally {
  Pop-Location
}

$printers = @(Get-Printer -ErrorAction Stop)
$zebra = $printers | Where-Object Name -eq 'ZDesigner ZD421-203dpi ZPL'
$epson = $printers | Where-Object Name -eq 'EPSON TM-T20III Receipt'

if ($zebra) {
  Write-Host "Zebra ready: $($zebra.Name)"
} else {
  Write-Warning 'Zebra printer not found: ZDesigner ZD421-203dpi ZPL'
}
if ($epson) {
  Write-Host "Epson ready: $($epson.Name)"
} else {
  Write-Warning 'Epson printer not found: EPSON TM-T20III Receipt'
}

$pfx = Join-Path $toolsDir 'certs\bridge.pfx'
if (-not (Test-Path $pfx)) {
  & (Join-Path $toolsDir 'generate-bridge-cert.ps1')
}
& (Join-Path $toolsDir 'trust-bridge-cert.ps1')

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $startScript
$shortcut.WorkingDirectory = $toolsDir
$shortcut.Description = 'Rare Vet LIMS Zebra and Epson print bridge'
$shortcut.WindowStyle = 7
$shortcut.Save()

if (Test-Path $legacyStartup) {
  Remove-Item $legacyStartup -Force
  Write-Host "Removed legacy Zebra-only startup entry: $legacyStartup"
}

Write-Host "Automatic startup enabled: $shortcutPath"

# Restart the bridge so the newly installed Epson endpoint is active.
Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq 'node.exe' -and
    $_.CommandLine -match 'zebra-local-bridge\.js'
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Process -FilePath $startScript -WorkingDirectory $toolsDir -WindowStyle Minimized
Start-Sleep -Seconds 3

try {
  $status = Invoke-RestMethod -Uri 'http://127.0.0.1:9100/epson/status' -TimeoutSec 8
  Write-Host "Print bridge is running. Epson: $($status.printer)"
} catch {
  Write-Warning "Bridge started, but Epson status check failed: $($_.Exception.Message)"
}

Write-Host 'Setup complete. Printing will start automatically after Windows sign-in.'
