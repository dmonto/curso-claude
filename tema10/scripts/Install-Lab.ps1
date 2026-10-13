param([switch]$AllVersions, [ValidatePattern('^v(0[1-9]|10)$')][string]$Version = 'v10')
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$versions = Get-Content (Join-Path $root 'versions.json') -Raw | ConvertFrom-Json
$selected = @($versions | Where-Object { $AllVersions -or $_.id -eq $Version })
$directories = @($selected | ForEach-Object { $_.directory }) + @('frontend-angular')
foreach ($directory in $directories) {
    Push-Location (Join-Path $root $directory)
    try {
        Write-Host "Instalando $directory"
        npm ci --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) { throw "npm ci ha fallado en $directory" }
    } finally { Pop-Location }
}
