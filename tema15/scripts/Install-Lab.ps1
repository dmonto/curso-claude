$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
if (-not (Test-Path (Join-Path $root '.env'))) { Copy-Item (Join-Path $root '.env.example') (Join-Path $root '.env') }
Push-Location (Join-Path $root 'frontend-angular')
try { npm.cmd install; if ($LASTEXITCODE -ne 0) { throw 'No se pudieron instalar las dependencias Angular' } } finally { Pop-Location }
