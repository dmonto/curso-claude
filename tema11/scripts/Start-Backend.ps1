param([ValidatePattern('^v(0[1-9]|10)$')][string]$Version = 'v10')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $repoRoot
try { node scripts/start-backend.mjs $Version } finally { Pop-Location }
