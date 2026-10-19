$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $repoRoot 'frontend-angular')
try { npm start; if ($LASTEXITCODE -ne 0) { throw 'Fallo de Angular' } } finally { Pop-Location }
