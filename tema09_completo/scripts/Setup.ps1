param([ValidateRange(1,10)][int]$Version = 10, [switch]$AllVersions, [switch]$BackendOnly)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$versions = Get-Content (Join-Path $root "versions.json") -Raw | ConvertFrom-Json
$nodeVersion = [version]((node --version).TrimStart('v'))
if ($LASTEXITCODE -ne 0 -or $nodeVersion.Major -ne 24 -or $nodeVersion.Minor -lt 15) {
    throw "Instala Node.js 24 LTS actualizado (24.15 o posterior)."
}
$selected = @($versions | Where-Object { $AllVersions -or $_.stage -eq $Version })
foreach ($versionInfo in $selected) {
    $directory = Join-Path $root $versionInfo.directory
    Push-Location $directory
    try {
        npm ci --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) { throw "Fallo instalando $($versionInfo.version)" }
        if (-not (Test-Path .env)) { Copy-Item .env.example .env }
    } finally { Pop-Location }
}
if (-not $BackendOnly) {
    Push-Location (Join-Path $root "frontend-angular")
    try {
        npm ci --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) { throw "Fallo instalando Angular" }
    } finally { Pop-Location }
}
Write-Host "Instalacion completada. Arranca backend y frontend en terminales separadas." -ForegroundColor Green
