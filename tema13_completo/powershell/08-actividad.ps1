param([string]$BaseUrl='http://127.0.0.1:3000',[string]$Password='Password123!')
. (Join-Path $PSScriptRoot 'common.ps1') -BaseUrl $BaseUrl
$token=Get-LabToken -Password $Password
Invoke-Lab -Path '/assistant' -Token $token -Method POST -Body @{message='Resume los tickets visibles'} | ConvertTo-Json -Depth 10
Invoke-Lab -Path '/activity/summary' -Token $token | ConvertTo-Json -Depth 10
