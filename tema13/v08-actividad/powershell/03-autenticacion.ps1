param([string]$BaseUrl='http://127.0.0.1:3000',[string]$Password='Password123!')
. (Join-Path $PSScriptRoot 'common.ps1') -BaseUrl $BaseUrl
$token=Get-LabToken -Password $Password
Invoke-Lab -Path '/auth/me' -Token $token | ConvertTo-Json -Depth 10
Assert-Status { Invoke-Lab -Path '/tickets' } 401
