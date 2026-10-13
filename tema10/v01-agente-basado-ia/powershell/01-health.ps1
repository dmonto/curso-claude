param([string]$BaseUrl = 'http://127.0.0.1:3000', [string]$UserId = 'demo-agent')
. (Join-Path $PSScriptRoot 'common.ps1')
$null = Invoke-LabGet -BaseUrl $BaseUrl -Path '/health' -UserId $UserId
$null = Invoke-LabGet -BaseUrl $BaseUrl -Path '/api/capabilities' -UserId $UserId
$null = Invoke-LabGet -BaseUrl $BaseUrl -Path '/api/demo/orders' -UserId $UserId
