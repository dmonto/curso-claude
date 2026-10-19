param([string]$BaseUrl='http://127.0.0.1:3000',[string]$Password='Password123!')
. (Join-Path $PSScriptRoot 'common.ps1') -BaseUrl $BaseUrl
$token=Get-LabToken -Password $Password
Assert-Status { Invoke-Lab -Path '/assistant/action' -Token $token -Method POST -Body @{action='close_ticket';ticketId='TCK-1002'} } 409
Invoke-Lab -Path '/assistant/action' -Token $token -Method POST -Body @{action='close_ticket';ticketId='TCK-1002';confirmation='CONFIRMO CERRAR TCK-1002'} | ConvertTo-Json -Depth 10
Invoke-Lab -Path '/audit/actions/verify' -Token $token | ConvertTo-Json -Depth 10
