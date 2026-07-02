# Simulate LIMS print -> local bridge -> Zebra RAW
$zplFile = Join-Path $PSScriptRoot 'sample-label-cbc.zpl'
if (-not (Test-Path $zplFile)) { throw "Missing $zplFile" }
$zpl = Get-Content $zplFile -Raw -Encoding ASCII
$body = @{ device = @{ name = 'LIMS Zebra Bridge' }; data = $zpl } | ConvertTo-Json -Compress
try {
  $res = Invoke-RestMethod -Uri 'https://127.0.0.1:9101/write' -Method Post -Body $body -ContentType 'application/json'
  Write-Host "Bridge OK:" ($res | ConvertTo-Json -Compress)
} catch {
  Write-Host "Bridge failed. Run start-lims-zebra-bridge.bat first."
  throw
}
