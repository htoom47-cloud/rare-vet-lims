$ErrorActionPreference = 'Stop'

$toolsDir = $PSScriptRoot
$packageFile = Join-Path $toolsDir 'package.json'
$startScript = Join-Path $toolsDir 'start-lims-print-bridge.bat'
$hiddenLauncher = Join-Path $toolsDir 'start-lims-print-bridge-hidden.vbs'
$startupDir = [Environment]::GetFolderPath('Startup')
$shortcutPath = Join-Path $startupDir 'LIMS Print Bridge.lnk'
$legacyStartup = Join-Path $startupDir 'LIMS-Zebra-Bridge.vbs'
$legacyBatShortcut = Join-Path $startupDir 'LIMS Print Bridge.lnk'

Write-Host 'Installing LIMS local print bridge (Zebra + Epson)...'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw 'Node.js is not installed or is not available in PATH.'
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw 'npm is not installed or is not available in PATH.'
}
if (-not (Test-Path $packageFile)) {
  throw "Missing package file: $packageFile"
}
if (-not (Test-Path $hiddenLauncher)) {
  throw "Missing silent launcher: $hiddenLauncher"
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
$hp = $printers | Where-Object Name -eq 'HP Smart Tank 580-590 series'

if ($zebra) {
  Write-Host "Zebra ready: $($zebra.Name) [$($zebra.PrinterStatus)]"
} else {
  Write-Warning 'Zebra printer not found: ZDesigner ZD421-203dpi ZPL'
}
if ($epson) {
  Write-Host "Epson ready: $($epson.Name) [$($epson.PrinterStatus)]"
} else {
  Write-Warning 'Epson printer not found: EPSON TM-T20III Receipt'
}
if ($hp) {
  Write-Host "HP ready: $($hp.Name) [$($hp.PrinterStatus)] jobs=$($hp.JobCount)"
}

# Clear stuck HP jobs if any (does not affect Epson/Zebra queues via spooler restart)
if ($hp -and $hp.JobCount -gt 0) {
  Write-Host "Clearing $($hp.JobCount) stuck HP job(s)..."
  Get-PrintJob -PrinterName $hp.Name -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-PrintJob -InputObject $_ -ErrorAction SilentlyContinue }
}

$pfx = Join-Path $toolsDir 'certs\bridge.pfx'
if (-not (Test-Path $pfx)) {
  & (Join-Path $toolsDir 'generate-bridge-cert.ps1')
}
& (Join-Path $toolsDir 'trust-bridge-cert.ps1')

# Prefer silent VBS autostart (no console window / no pause)
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $hiddenLauncher
$shortcut.WorkingDirectory = $toolsDir
$shortcut.Description = 'Rare Vet LIMS Zebra barcodes + Epson invoices print bridge'
$shortcut.WindowStyle = 7
$shortcut.Save()

Get-ChildItem $startupDir -Filter 'LIMS*Bridge*' -ErrorAction SilentlyContinue |
  Where-Object { $_.FullName -ne $shortcutPath } |
  ForEach-Object {
    Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
    Write-Host "Removed legacy startup entry: $($_.Name)"
  }

if (Test-Path $legacyStartup) {
  Remove-Item $legacyStartup -Force
  Write-Host "Removed legacy Zebra-only startup entry: $legacyStartup"
}

Write-Host "Automatic startup enabled: $shortcutPath"

# Stop any existing bridge instance
Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq 'node.exe' -and
    $_.CommandLine -match 'zebra-local-bridge\.js'
  } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 1
Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$hiddenLauncher`"" -WindowStyle Hidden
Start-Sleep -Seconds 4

try {
  $epsonStatus = Invoke-RestMethod -Uri 'http://127.0.0.1:9100/epson/status' -TimeoutSec 8
  $zebraStatus = Invoke-RestMethod -Uri 'http://127.0.0.1:9100/default' -TimeoutSec 8
  Write-Host "Bridge running."
  Write-Host "Epson: $($epsonStatus.printer) ready=$($epsonStatus.ready)"
  Write-Host "Zebra: $($zebraStatus.device.name)"
} catch {
  Write-Warning "Bridge started, but status check failed: $($_.Exception.Message)"
  Write-Host "Try manually: $startScript"
}

Write-Host 'Setup complete. Printing will start automatically after Windows sign-in.'
