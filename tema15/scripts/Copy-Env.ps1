param([ValidatePattern('^v(0[1-9]|10)$')][string]$Version='v10')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$v=Get-Content (Join-Path $root 'versions.json') -Raw | ConvertFrom-Json | Where-Object { $_.id -eq $Version }
Copy-Item -LiteralPath (Join-Path $root '.env') -Destination (Join-Path (Join-Path $root $v.directory) '.env')
Write-Host "Configuración copiada a $($v.directory)"
