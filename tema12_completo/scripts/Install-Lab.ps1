param(
  [ValidatePattern('^v[0-9]{2}$')][string]$Version = 'v10',
  [switch]$AllVersions
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $repoRoot
try {
  if (-not (Test-Path .\.env)) { Copy-Item .\.env.example .\.env -Force }
  $versions = Get-Content .\versions.json | ConvertFrom-Json
  $selected = if ($AllVersions) { $versions } else { $versions | Where-Object { $_.id -eq $Version } }
  foreach ($v in $selected) {
    Write-Host "Instalando $($v.id) · $($v.title)"
    Copy-Item .\.env (Join-Path $v.directory '.env') -Force
    Push-Location $v.directory
    try { npm install } finally { Pop-Location }
  }
  if (Test-Path .\frontend-angular\package.json) {
    Push-Location .\frontend-angular
    try { npm install } finally { Pop-Location }
  }
} finally { Pop-Location }
