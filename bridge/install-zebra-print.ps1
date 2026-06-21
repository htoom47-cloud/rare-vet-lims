# Zebra Browser Print — auto label printing on reception PC
# Run on the reception computer (ZD421 connected via USB).

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Rare Vet — Zebra Browser Print Setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This enables silent label printing from the LIMS website to ZD421." -ForegroundColor Gray
Write-Host ""
Write-Host "Steps:" -ForegroundColor Yellow
Write-Host "  1. Download Zebra Browser Print from:"
Write-Host "     https://www.zebra.com/us/en/support-downloads/software/printer-software/browser-print.html"
Write-Host "  2. Install and run Browser Print (tray icon must be active)."
Write-Host "  3. Connect ZD421 via USB and set it as default printer in Browser Print."
Write-Host "  4. Label: Direct thermal 50 x 25 mm"
Write-Host "  5. Open LIMS on THIS PC and print a sample label — no dialog if setup is OK."
Write-Host ""
Write-Host "Service ports: localhost 9100 (http) / 9101 (https)" -ForegroundColor Gray
Write-Host ""

$browserPrint = Get-Process -Name "BrowserPrint*" -ErrorAction SilentlyContinue
if ($browserPrint) {
  Write-Host "Browser Print is running (PID $($browserPrint.Id))." -ForegroundColor Green
} else {
  Write-Host "Browser Print is NOT running — install and start it first." -ForegroundColor Red
}

$zebra = Get-Printer -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'ZD421|ZDesigner' }
if ($zebra) {
  Write-Host "Windows printer: $($zebra.Name)" -ForegroundColor Green
} else {
  Write-Host "ZDesigner ZD421 not found in Windows printers — install Zebra driver." -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Press Enter to close"
