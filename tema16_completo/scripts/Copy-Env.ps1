$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot
Get-ChildItem $root -Directory -Filter 'v??-*' | ForEach-Object { Copy-Item -LiteralPath (Join-Path $root '.env') -Destination (Join-Path $_.FullName '.env') }
Write-Host 'Copiado. Las copias locales tienen prioridad; vuelve a copiar después de editar el .env común.'
