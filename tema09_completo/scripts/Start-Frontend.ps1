$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $root "frontend-angular")
try {
    if (-not (Test-Path node_modules)) { throw "Ejecuta primero .\scripts\Setup.ps1" }
    npm start
    if ($LASTEXITCODE -ne 0) { throw "El frontend no pudo arrancar." }
} finally { Pop-Location }
