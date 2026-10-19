param([string]$BaseUrl='http://127.0.0.1:3000')
. (Join-Path $PSScriptRoot 'common.ps1')
Invoke-LabGet '/health'
Invoke-LabGet '/ready'
