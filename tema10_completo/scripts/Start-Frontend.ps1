Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Push-Location (Join-Path $root 'frontend-angular')
try {
    npm start
    if ($LASTEXITCODE -ne 0) { throw 'Angular no pudo iniciarse.' }
} finally { Pop-Location }
