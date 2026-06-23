# Deploy parasitology agent to remote PC via WinRM + admin share
# Usage: .\deploy-remote.ps1 -Username User
param(
  [string]$ComputerName = '192.168.1.101',
  [Parameter(Mandatory = $true)][string]$Username,
  [string]$Password,
  [string]$RemoteDir = 'C:\RareVet\parasitology-agent',
  [string]$WatchDir = 'C:\Users\User\Desktop\صور الطفيليات'
)

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot

if (-not $Password) {
  $sec = Read-Host "Windows password for $Username" -AsSecureString
} else {
  $sec = ConvertTo-SecureString $Password -AsPlainText -Force
}
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
)
$cred = New-Object PSCredential ($Username, $sec)

Write-Host "Testing WinRM on $ComputerName..."
$t = Test-NetConnection -ComputerName $ComputerName -Port 5985 -WarningAction SilentlyContinue
if (-not $t.TcpTestSucceeded) { throw "WinRM port 5985 not reachable" }

$share = "\\$ComputerName\C$"
Write-Host "Mapping $share ..."
cmd /c "net use `"$share`" /user:`"$Username`" `"$plain`"" | Out-Null

try {
  $dest = Join-Path $share 'RareVet\parasitology-agent'
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  Write-Host "Copying files..."
  robocopy $src $dest /MIR /XD node_modules /NFL /NDL /NJH /NJS /nc /ns /np | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

  Write-Host "Remote install + start..."
  $out = Invoke-Command -ComputerName $ComputerName -Credential $cred -ScriptBlock {
    param($RemoteDir, $WatchDir)
    Set-Location $RemoteDir
    New-Item -ItemType Directory -Path $WatchDir -Force | Out-Null
    if (-not (Test-Path 'node_modules')) {
      & npm.cmd install --omit=dev 2>&1 | Out-String
    }
    & node setup.js $WatchDir
    $existing = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -like '*parasitology-agent*agent.js*' }
    foreach ($p in $existing) { Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm start' -WorkingDirectory $RemoteDir -WindowStyle Normal
    'OK'
  } -ArgumentList $RemoteDir, $WatchDir

  Write-Host "Remote result: $out"
  Write-Host "Open on parasitology PC: http://localhost:3920"
} finally {
  cmd /c "net use `"$share`" /delete /y" 2>$null | Out-Null
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)
  )
}
