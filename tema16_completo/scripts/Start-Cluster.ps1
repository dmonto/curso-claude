param([ValidateRange(6,10)][int]$Version=10)
node (Join-Path $PSScriptRoot 'cluster.mjs') $Version
