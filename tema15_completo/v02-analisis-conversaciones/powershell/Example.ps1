param([string]$BaseUrl='http://127.0.0.1:3000')
. (Join-Path $PSScriptRoot 'common.ps1')
$r=Send-Demo -BaseUrl $BaseUrl -Task invoice_help -Entity ''
$null=Invoke-Lab -BaseUrl $BaseUrl -Path '/analysis/conversations'
