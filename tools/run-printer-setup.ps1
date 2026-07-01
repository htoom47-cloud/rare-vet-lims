# Full ZD421 setup: Link-OS SGD + calibrate + test label (RAW).
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$raw = Join-Path $here 'send-zebra-raw.ps1'
$printer = 'ZDesigner ZD421-203dpi ZPL'

Write-Host '=== ZD421 setup: SGD config ==='
& $raw -ZplFile (Join-Path $here 'printer-setup.sgd') -PrinterName $printer
Start-Sleep -Seconds 8

Write-Host '=== ZD421 setup: calibrate + test label ==='
& $raw -ZplFile (Join-Path $here 'printer-setup-label.zpl') -PrinterName $printer
Start-Sleep -Seconds 3

Write-Host '=== Done. Check label for box + OK + barcode BRIDGE-OK ==='
