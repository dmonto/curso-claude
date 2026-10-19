param([ValidatePattern('^v(0[1-9]|10)$')][string]$Version='v10')
$ErrorActionPreference='Stop'
Push-Location (Split-Path $PSScriptRoot -Parent)
try { node scripts/start.mjs $Version } finally { Pop-Location }
