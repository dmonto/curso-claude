param([ValidateRange(1,10)][int]$Version=10,[switch]$CopyEnv)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$prefix='v{0:d2}-' -f $Version
$dir=Get-ChildItem -LiteralPath $root -Directory | Where-Object Name -Like "$prefix*" | Select-Object -First 1
if (!$dir) { throw 'No se encuentra la versión' }
if ($CopyEnv) {
  $target=Join-Path $dir.FullName '.env'
  if (Test-Path -LiteralPath $target) { throw 'Ya existe .env local; revísalo antes de reemplazarlo.' }
  Copy-Item -LiteralPath (Join-Path $root '.env') -Destination $target
}
node (Join-Path $dir.FullName 'server.js')
if ($LASTEXITCODE -ne 0) { throw 'Falló el backend' }
