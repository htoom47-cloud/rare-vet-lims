# Quick health check for Norma bridge on lab PC
param([int]$Port = 21110)

Write-Host "=== Norma Bridge verify ===" -ForegroundColor Cyan

$ip = (Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -like "192.168.*" } |
  Select-Object -First 1).IPAddress
Write-Host "Lab PC IPv4 (Norma LIS IP): $ip" -ForegroundColor Yellow

$listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listen) {
  Write-Host "Port $Port listening: OK" -ForegroundColor Green
} else {
  Write-Host "Port $Port NOT listening - run: pm2 restart norma-bridge" -ForegroundColor Red
}

try {
  pm2 describe norma-bridge 2>$null | Out-Null
  if ($LASTEXITCODE -eq 0) {
    pm2 status norma-bridge
  } else {
    Write-Host "PM2 norma-bridge not registered" -ForegroundColor Red
  }
} catch {
  Write-Host "PM2 not installed" -ForegroundColor Red
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
  Write-Host "Tip: if Norma sends OK but this fails, test: curl.exe -4 https://lims.rarevetcare.com/api/health" -ForegroundColor Yellow
}

Write-Host ""
Write-Host ('Norma LIS: IP={0}  port={1}  HL7_1.0' -f $ip, $Port) -ForegroundColor Cyan
