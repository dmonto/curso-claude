param([string]$BaseUrl='http://127.0.0.1:3000',[string]$Password='Password123!')
. (Join-Path $PSScriptRoot 'common.ps1') -BaseUrl $BaseUrl
$token=Get-LabToken -Password $Password
Invoke-Lab -Path '/compliance/report' -Token $token | ConvertTo-Json -Depth 10
Invoke-Lab -Path '/privacy/me/activity' -Token $token | ConvertTo-Json -Depth 10
Invoke-Lab -Path '/privacy/me/delete-request' -Token $token -Method POST -Body @{} | ConvertTo-Json -Depth 10
