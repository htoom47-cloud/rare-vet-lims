# Deploy LIMS Zebra Bridge to reception PC over LAN (WinRM).
# Usage:
#   .\deploy-reception-zebra.ps1 -Username قنوش
#   .\deploy-reception-zebra.ps1 -ComputerName 192.168.1.100 -Username قنوش
param(
  [string]$ComputerName = '192.168.1.100',
  [Parameter(Mandatory = $true)][string]$Username,
  [string]$Password,
  [string]$RemoteDir = 'C:\RareVet\zebra-bridge'
)

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot

$files = @(
  'zebra-local-bridge.js',
  'send-zebra-raw.ps1',
  'generate-bridge-cert.ps1',
  'trust-bridge-cert.ps1',
  'sample-label-cbc.zpl',
  'install-reception-zebra.ps1'
)

foreach ($f in $files) {
  if (-not (Test-Path (Join-Path $src $f))) {
    throw "Missing $f in $src"
  }
}

if (-not $Password) {
  $sec = Read-Host "Windows password for $Username on $ComputerName" -AsSecureString
} else {
  $sec = ConvertTo-SecureString $Password -AsPlainText -Force
}
$cred = New-Object PSCredential ($Username, $sec)

Write-Host "Testing WinRM on $ComputerName..."
$t = Test-NetConnection -ComputerName $ComputerName -Port 5985 -WarningAction SilentlyContinue
if (-not $t.TcpTestSucceeded) {
  throw "WinRM not reachable on $ComputerName — enable WinRM on reception PC."
}

Write-Host "Opening remote session as $Username..."
$session = New-PSSession -ComputerName $ComputerName -Credential $cred
try {
  Invoke-Command -Session $session -ScriptBlock {
    param($dir)
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  } -ArgumentList $RemoteDir

  Write-Host 'Copying bridge files...'
  foreach ($f in $files) {
    Copy-Item -Path (Join-Path $src $f) -Destination (Join-Path $RemoteDir $f) -ToSession $session -Force
  }

  $out = Invoke-Command -Session $session -ScriptBlock {
    param($RemoteDir)
    Set-Location $RemoteDir

    $startBat = @"
@echo off
title LIMS Zebra Bridge (Reception)
cd /d C:\RareVet\zebra-bridge
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0generate-bridge-cert.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0trust-bridge-cert.ps1"
echo.
echo Bridge: https://127.0.0.1:9101
echo Keep this window open while printing from LIMS.
start "" "https://127.0.0.1:9101/"
node "%~dp0zebra-local-bridge.js"
pause
"@
    Set-Content -Path (Join-Path $RemoteDir 'start-zebra-bridge.bat') -Value $startBat -Encoding ASCII

    $node = Get-Command node -ErrorAction SilentlyContinue
    $nodeOk = [bool]$node

    $printers = Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'ZD421|ZDesigner|Zebra' } | Select-Object -ExpandProperty Name
    $browserPrint = Get-Process -Name 'BrowserPrint*' -ErrorAction SilentlyContinue

    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RemoteDir 'generate-bridge-cert.ps1') | Out-Null
    powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $RemoteDir 'trust-bridge-cert.ps1') | Out-Null

    $desktop = [Environment]::GetFolderPath('Desktop')
    $wsh = New-Object -ComObject WScript.Shell
    $sc = $wsh.CreateShortcut((Join-Path $desktop 'LIMS Zebra Bridge.lnk'))
    $sc.TargetPath = Join-Path $RemoteDir 'start-zebra-bridge.bat'
    $sc.WorkingDirectory = $RemoteDir
    $sc.Save()

  $startup = [Environment]::GetFolderPath('Startup')
  $sc2 = $wsh.CreateShortcut((Join-Path $startup 'LIMS Zebra Bridge.lnk'))
  $sc2.TargetPath = Join-Path $RemoteDir 'start-zebra-bridge.bat'
  $sc2.WorkingDirectory = $RemoteDir
  $sc2.Save()

    [pscustomobject]@{
      hostname = $env:COMPUTERNAME
      user = $env:USERNAME
      node = $nodeOk
      nodePath = if ($node) { $node.Source } else { $null }
      zebraPrinters = $printers
      browserPrintRunning = [bool]$browserPrint
      bridgeDir = $RemoteDir
    }
  } -ArgumentList $RemoteDir

  Write-Host ''
  Write-Host '=== Reception PC ===' -ForegroundColor Cyan
  $out | Format-List

  if (-not $out.node) {
    Write-Host '[!] Node.js missing on reception — install LTS from https://nodejs.org' -ForegroundColor Yellow
  }
  if (-not $out.zebraPrinters) {
    Write-Host '[!] Zebra printer not found — connect ZD421 via USB' -ForegroundColor Yellow
  }
  if (-not $out.browserPrintRunning) {
    Write-Host '[i] Optional: install Zebra Browser Print for backup printing' -ForegroundColor Gray
  }

  Write-Host ''
  Write-Host 'Starting bridge on reception (new window)...' -ForegroundColor Green
  Invoke-Command -Session $session -ScriptBlock {
    param($RemoteDir)
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', (Join-Path $RemoteDir 'start-zebra-bridge.bat')
  } -ArgumentList $RemoteDir

  Write-Host 'Done. On reception: open https://lims.rarevetcare.com and Ctrl+F5' -ForegroundColor Green
} finally {
  if ($session) { Remove-PSSession $session }
}
