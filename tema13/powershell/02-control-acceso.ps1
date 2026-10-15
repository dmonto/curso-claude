param([string]$BaseUrl='http://127.0.0.1:3000',[string]$Password='Password123!')
. (Join-Path $PSScriptRoot 'common.ps1') -BaseUrl $BaseUrl
$token=Get-LabToken -Email 'ana@empresa.com' -Password $Password
Invoke-Lab -Path '/tickets' -Token $token | ConvertTo-Json -Depth 10
