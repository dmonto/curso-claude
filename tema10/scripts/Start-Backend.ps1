param(
    [ValidatePattern('^v(0[1-9]|10)$')][string]$Version = 'v10',
    [ValidateSet('','mock','claude')][string]$Mode = '',
    [ValidateRange(0,65535)][int]$Port = 0,
    [string]$DataDirectory = ''
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$versions = Get-Content (Join-Path $root 'versions.json') -Raw | ConvertFrom-Json
$selected = $versions | Where-Object { $_.id -eq $Version }
$versionPath = Join-Path $root $selected.directory
$previousMode = $env:MODEL_MODE
$previousPort = $env:PORT
$previousData = $env:DATA_DIR
Push-Location $versionPath
try {
    if (-not (Test-Path 'node_modules')) { throw "Primero ejecuta .\scripts\Install-Lab.ps1 -Version $Version desde la raíz." }
    # La raíz es la única fuente de configuración. Cada arranque refresca la copia.
    Copy-Item (Join-Path $root '.env') (Join-Path $versionPath '.env') -Force
    if ($Mode) { $env:MODEL_MODE = $Mode }
    if ($Port) { $env:PORT = [string]$Port }
    if ($DataDirectory) { $env:DATA_DIR = $DataDirectory }
    node server.js
    if ($LASTEXITCODE -ne 0) { throw 'El backend no pudo iniciarse.' }
} finally {
    $env:MODEL_MODE = $previousMode
    $env:PORT = $previousPort
    $env:DATA_DIR = $previousData
    Pop-Location
}
