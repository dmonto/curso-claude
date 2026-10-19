param([string]$BaseUrl='http://127.0.0.1:3000',[string]$Password='Password123!')
. (Join-Path $PSScriptRoot 'common.ps1') -BaseUrl $BaseUrl
$token=Get-LabToken -Email 'ana@empresa.com' -Password $Password
$r=Invoke-Lab -Path '/tickets' -Token $token
$r | ConvertTo-Json -Depth 10
if (($r | ConvertTo-Json -Depth 10) -match 'paymentToken|ana@empresa.com') { throw 'Proyección insegura' }
