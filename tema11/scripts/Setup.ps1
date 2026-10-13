param([ValidatePattern('^v(0[1-9]|10)$')][string]$Version = 'v10', [switch]$All)
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
Push-Location $repoRoot
try {
    node --version
    npm ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Ha fallado la instalación del frontend.' }
    if ($All) {
        node scripts/install-backends.mjs
        if ($LASTEXITCODE -ne 0) { throw 'Ha fallado la instalación de los backends.' }
    } else {
        $versions = Get-Content "$repoRoot/versions.json" -Raw | ConvertFrom-Json
        $target = $versions | Where-Object { $_.id -eq $Version }
        Push-Location "$repoRoot/$($target.directory)"
        try {
            npm ci --no-audit --no-fund
            if ($LASTEXITCODE -ne 0) { throw 'Ha fallado la instalación del backend.' }
            npm run init
        } finally { Pop-Location }
    }
} finally { Pop-Location }
