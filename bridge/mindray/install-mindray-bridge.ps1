# Persistent Mindray bridge install — run PowerShell as Administrator
# Does NOT touch Norma bridge (C:\RareVet\bridge, port 21110)

param(
  [string]$TargetDir = "C:\RareVet\mindray-bridge",
  [string]$SourceDir = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "=== Mindray BS-120 — persistent bridge install ===" -ForegroundColor Cyan
Write-Host ""

& (Join-Path $SourceDir "configure-mindray-bridge.ps1") `
  -TargetDir $TargetDir `
  -SourceDir $SourceDir `
  -Persistent

Write-Host "Install complete. Norma bridge (if any) is unchanged." -ForegroundColor Green
