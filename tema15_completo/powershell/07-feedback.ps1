param([string]$BaseUrl='http://127.0.0.1:3000')
. (Join-Path $PSScriptRoot 'common.ps1')
$r=Send-Demo -BaseUrl $BaseUrl
$null=Invoke-Lab -BaseUrl $BaseUrl -Path '/api/assistant/feedback' -Method POST -Body @{event_id=$r.event_id;rating='negative';reason='missing_information'}
$null=Invoke-Lab -BaseUrl $BaseUrl -Path '/feedback/summary'
