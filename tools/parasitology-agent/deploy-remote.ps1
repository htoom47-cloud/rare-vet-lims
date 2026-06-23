# Deploy parasitology agent via WinRM (no admin share needed)
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
  $sec = Read-Host "Windows password for $Username on $ComputerName" -AsSecureString
} else {
  $sec = ConvertTo-SecureString $Password -AsPlainText -Force
}
$cred = New-Object PSCredential ($Username, $sec)

Write-Host "Testing WinRM on $ComputerName..."
$t = Test-NetConnection -ComputerName $ComputerName -Port 5985 -WarningAction SilentlyContinue
if (-not $t.TcpTestSucceeded) {
  throw "WinRM not reachable on $ComputerName — enable it on parasitology PC first."
}

Write-Host "Opening remote session..."
$session = New-PSSession -ComputerName $ComputerName -Credential $cred
try {
  Write-Host "Copying files (via WinRM, not USB)..."
  Invoke-Command -Session $session -ScriptBlock {
    param($dir)
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  } -ArgumentList $RemoteDir

  $files = Get-ChildItem $src -Recurse | Where-Object {
    $_.FullName -notmatch '\\node_modules\\' -and $_.Name -ne 'node_modules'
  }
  foreach ($item in $files) {
    $rel = $item.FullName.Substring($src.Length).TrimStart('\')
    $remotePath = Join-Path $RemoteDir $rel
    if ($item.PSIsContainer) {
      Invoke-Command -Session $session -ScriptBlock {
        param($p) New-Item -ItemType Directory -Path $p -Force | Out-Null
      } -ArgumentList $remotePath
    } else {
      Copy-Item -Path $item.FullName -Destination $remotePath -ToSession $session -Force
    }
  }

  Write-Host "Installing and starting agent..."
  $out = Invoke-Command -Session $session -ScriptBlock {
    param($RemoteDir, $WatchDir)
    Set-Location $RemoteDir
    New-Item -ItemType Directory -Path $WatchDir -Force | Out-Null
    if (-not (Test-Path 'node_modules')) {
      & npm.cmd install --omit=dev 2>&1 | Out-String
    }
    & node setup.js $WatchDir
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -like '*parasitology-agent*agent.js*' } |
      ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/k', 'npm start' -WorkingDirectory $RemoteDir
    'OK — agent started'
  } -ArgumentList $RemoteDir, $WatchDir

  Write-Host $out
  Write-Host "On parasitology PC open: http://localhost:3920"
} catch {
  Write-Host ""
  Write-Host "فشل النشر عن بُعد: $($_.Exception.Message)"
  Write-Host "الحل البديل: انسخ المجلد بفلاشة USB وشغّل START-AGENT.bat على كمبيوتر الطفيليات."
  throw
} finally {
  if ($session) { Remove-PSSession $session }
}
