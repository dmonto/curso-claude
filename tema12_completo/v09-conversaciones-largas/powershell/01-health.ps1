
param([string]$BaseUrl='http://127.0.0.1:3000')
. $PSScriptRoot\common.ps1
Invoke-LabGet -BaseUrl $BaseUrl -Path '/health'
Invoke-LabGet -BaseUrl $BaseUrl -Path '/api/capabilities'
