$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $root 'frontend-angular')
try { npm.cmd start; if ($LASTEXITCODE -ne 0) { throw 'Falló Angular' } } finally { Pop-Location }
