param([string]$BaseUrl='http://127.0.0.1:3000')
. (Join-Path $PSScriptRoot 'common.ps1')
$null=Invoke-Lab -BaseUrl $BaseUrl -Path '/prompts/compare' -Method POST
