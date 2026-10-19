param([string]$BaseUrl='http://127.0.0.1:3000')
. (Join-Path $PSScriptRoot 'common.ps1')
$r=Send-Demo -BaseUrl $BaseUrl -Simulate slow
$null=Invoke-Lab -BaseUrl $BaseUrl -Path '/metrics/performance'
