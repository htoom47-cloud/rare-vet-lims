# Send ZPL — uses Windows RAW API (reliable); falls back to USB port copy.
param(
  [Parameter(Mandatory = $true)]
  [string]$ZplFile,
  [string]$PrinterName = 'ZDesigner ZD421-203dpi ZPL',
  [string]$Port = 'USB008'
)

$raw = Join-Path $PSScriptRoot 'send-zebra-raw.ps1'
if (Test-Path $raw) {
  & $raw -ZplFile $ZplFile -PrinterName $PrinterName
} else {
  cmd /c "copy /b `"$ZplFile`" $Port"
}
