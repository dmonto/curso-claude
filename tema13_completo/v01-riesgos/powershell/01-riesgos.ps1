param([string]$BaseUrl='http://127.0.0.1:3000',[string]$Password='Password123!')
. (Join-Path $PSScriptRoot 'common.ps1') -BaseUrl $BaseUrl
Invoke-Lab -Path '/health' | ConvertTo-Json -Depth 10
$token=Get-LabToken -Password $Password
Invoke-Lab -Path '/security/risks' -Token $token | ConvertTo-Json -Depth 10
