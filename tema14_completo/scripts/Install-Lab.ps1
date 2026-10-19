$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $repoRoot 'frontend-angular')
try { npm ci; if ($LASTEXITCODE -ne 0) { throw 'No se instalaron las dependencias de Angular' } } finally { Pop-Location }
