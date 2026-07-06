# Quick health check for Mindray BS-120 bridge on lab PC
param([int]$Port = 5150)

Write-Host "=== Mindray BS-120 Bridge verify ===" -ForegroundColor Cyan

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -like "192.168.*" -or $_.IPAddress -like "10.*" } |
  Select-Object -First 1).IPAddress
Write-Host "Lab PC IPv4 (Mindray LIS IP): $ip" -ForegroundColor Yellow

$listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listen) {
  Write-Host "Port $Port listening: OK" -ForegroundColor Green
} else {
  Write-Host "Port $Port NOT listening - run: pm2 restart mindray-bridge" -ForegroundColor Red
}

try {
  pm2 describe mindray-bridge 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    pm2 status mindray-bridge
  } else {
    Write-Host "PM2 mindray-bridge not registered" -ForegroundColor Red
  }
} catch {
  Write-Host "PM2 not installed" -ForegroundColor Red
}

$normaPort = Get-NetTCPConnection -LocalPort 21110 -State Listen -ErrorAction SilentlyContinue
if ($normaPort) {
  Write-Host 'Norma bridge (21110) also running: OK - no conflict' -ForegroundColor Green
}

try {
  $curl = Get-Command curl.exe -ErrorAction SilentlyContinue
  if ($curl) {
    $code = & curl.exe -4 -sS -m 20 -o NUL -w '%{http_code}' 'https://lims.rarevetcare.com/api/health' 2>$null
    if ($code -eq '200') {
      Write-Host "LIMS cloud reachable: 200" -ForegroundColor Green
    } else {
      Write-Host "LIMS cloud check failed (HTTP $code)" -ForegroundColor Red
    }
  } else {
    $r = Invoke-WebRequest -Uri 'https://lims.rarevetcare.com/api/health' -UseBasicParsing -TimeoutSec 25
    Write-Host "LIMS cloud reachable: $($r.StatusCode)" -ForegroundColor Green
  }
} catch {
  Write-Host "LIMS cloud unreachable: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host ('Mindray LIS: IP={0}  port={1}' -f $ip, $Port) -ForegroundColor Cyan
Write-Host 'Norma uses port 21110 separately - both can run on the same PC' -ForegroundColor Gray
