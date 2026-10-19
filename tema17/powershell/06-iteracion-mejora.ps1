param([string]$BaseUrl='http://127.0.0.1:3000')
. (Join-Path $PSScriptRoot 'common.ps1')
$r = Invoke-LabPost '/api/assistant' @{message='Resume TCK-1001'}
$null = Invoke-LabPost '/api/feedback' @{responseId=$r.responseId;rating=1}
Invoke-LabGet '/api/metrics'
