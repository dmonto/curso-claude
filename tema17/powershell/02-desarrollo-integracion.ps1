param([string]$BaseUrl='http://127.0.0.1:3000')
. (Join-Path $PSScriptRoot 'common.ps1')
$null = Invoke-LabPost '/api/assistant' @{message='Resume TCK-1001'}
