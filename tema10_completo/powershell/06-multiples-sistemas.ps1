param([string]$BaseUrl = 'http://127.0.0.1:3000', [string]$OrderId = '1843', [string]$UserId = 'demo-agent', [switch]$Confirm)
. (Join-Path $PSScriptRoot 'common.ps1')
$proposal = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -UserId $UserId -Body @{
    conversationId = New-LabConversation
    taskName = 'delivery_incident'
    message = "El cliente no ha recibido el pedido $OrderId. Revisa la entrega y abre una incidencia si procede."
}
if ($Confirm) { $null = Confirm-LabProposal -BaseUrl $BaseUrl -Proposal $proposal -UserId $UserId }
$null = Invoke-LabGet -BaseUrl $BaseUrl -Path '/api/demo/tickets' -UserId $UserId
