# Self-signed cert for LIMS Zebra Bridge HTTPS (required for lims.onrender.com).
$ErrorActionPreference = 'Stop'
$certsDir = Join-Path $PSScriptRoot 'certs'
$pfx = Join-Path $certsDir 'bridge.pfx'
if (-not (Test-Path $certsDir)) { New-Item -ItemType Directory -Path $certsDir | Out-Null }
if (Test-Path $pfx) {
  Write-Host "Certificate already exists: $pfx"
  exit 0
}
$cert = New-SelfSignedCertificate `
  -Subject 'CN=localhost' `
  -DnsName @('localhost', '127.0.0.1') `
  -KeyAlgorithm RSA -KeyLength 2048 `
  -NotAfter (Get-Date).AddYears(10) `
  -CertStoreLocation 'Cert:\CurrentUser\My' `
  -FriendlyName 'LIMS Zebra Bridge'
$pwd = ConvertTo-SecureString -String 'lims-bridge' -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $pwd | Out-Null
Write-Host "Created $pfx"
