param([ValidateRange(1,10)][int]$Version=10)
$ErrorActionPreference='Stop'
node (Join-Path $PSScriptRoot 'start.mjs') $Version
