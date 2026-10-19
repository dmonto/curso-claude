param(
  [ValidatePattern('^v[0-9]{2}$')][string]$Version = 'v10',
  [ValidateSet('mock','claude')][string]$Mode = 'mock',
  [int]$Port = 3000,
  [string]$DataDirectory = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $repoRoot
try {
  if (-not (Test-Path .\.env)) { Copy-Item .\.env.example .\.env -Force }
  $versions = Get-Content .\versions.json | ConvertFrom-Json
  $selected = $versions | Where-Object { $_.id -eq $Version } | Select-Object -First 1
  if (-not $selected) { throw "Versión desconocida: $Version" }
  $env:MODEL_MODE = $Mode
  $env:PORT = [string]$Port
  if ($DataDirectory) { $env:DATA_DIR = $DataDirectory }
  Copy-Item .\.env (Join-Path $selected.directory '.env') -Force
  node .\scripts\start-version.mjs $Version
} finally { Pop-Location }
