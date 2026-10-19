$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $root 'frontend-angular')
try { npm.cmd ci; if ($LASTEXITCODE -ne 0) { throw 'Falló la instalación Angular' } } finally { Pop-Location }
