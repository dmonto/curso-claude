Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $repoRoot 'frontend-angular')
try { npm start } finally { Pop-Location }
