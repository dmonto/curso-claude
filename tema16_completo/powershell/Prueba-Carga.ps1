param([string]$BaseUrl='http://127.0.0.1:3000',[int]$Requests=20,[int]$Concurrency=12)
node (Join-Path $PSScriptRoot '../scripts/load.mjs') $BaseUrl $Requests $Concurrency | ConvertFrom-Json | ConvertTo-Json -Depth 20
