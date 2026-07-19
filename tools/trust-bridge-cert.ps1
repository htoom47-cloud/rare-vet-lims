# Trust LIMS Zebra Bridge self-signed cert so Chrome opens https://127.0.0.1:9101
$ErrorActionPreference = 'Stop'
$pfx = Join-Path $PSScriptRoot 'certs\bridge.pfx'
if (-not (Test-Path $pfx)) {
  & (Join-Path $PSScriptRoot 'generate-bridge-cert.ps1')
}
$pwd = ConvertTo-SecureString -String 'lims-bridge' -Force -AsPlainText
Import-PfxCertificate -FilePath $pfx -CertStoreLocation Cert:\CurrentUser\My -Password $pwd -Exportable | Out-Null
$cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.FriendlyName -eq 'LIMS Zebra Bridge' } | Sort-Object NotAfter -Descending | Select-Object -First 1
if (-not $cert) {
  $cert = Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -match 'localhost' } | Sort-Object NotAfter -Descending | Select-Object -First 1
}
if (-not $cert) { throw 'Bridge certificate not found in CurrentUser\My' }
$root = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root', 'CurrentUser')
$root.Open('ReadWrite')
$existing = $root.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
if (-not $existing) {
  $root.Add($cert)
  Write-Host 'Certificate trusted. Chrome should open https://127.0.0.1:9101 without warnings.'
} else {
  Write-Host 'Certificate already trusted.'
}
$root.Close()
Write-Host "Open https://127.0.0.1:9101/default in Chrome, then restart Chrome if it was already open."
