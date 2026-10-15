param([ValidateRange(1,10)][int]$Version = 10, [ValidateSet("mock","claude")][string]$Mode = "mock", [ValidateRange(1,65535)][int]$Port = 3000)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$versions = Get-Content (Join-Path $root "versions.json") -Raw | ConvertFrom-Json
$versionInfo = $versions | Where-Object { $_.stage -eq $Version }
Push-Location (Join-Path $root $versionInfo.directory)
$previousMode = $env:AI_MODE
$previousPort = $env:PORT
try {
    $env:AI_MODE = $Mode
    $env:PORT = [string]$Port
    if (-not (Test-Path node_modules)) { throw "Ejecuta primero .\scripts\Setup.ps1 -Version $Version" }
    npm start
    if ($LASTEXITCODE -ne 0) { throw "El backend no pudo arrancar." }
} finally {
    $env:AI_MODE = $previousMode
    $env:PORT = $previousPort
    Pop-Location
}
