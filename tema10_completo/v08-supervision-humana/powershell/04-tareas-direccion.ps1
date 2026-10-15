param([string]$BaseUrl = 'http://127.0.0.1:3000', [string]$UserId = 'demo-agent', [switch]$Confirm)
. (Join-Path $PSScriptRoot 'common.ps1')
$null = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -UserId $UserId -Body @{
    taskName = 'cancel_order'
    message = 'Quiero cancelar un pedido'
}
$proposal = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -UserId $UserId -Body @{
    conversationId = New-LabConversation
    taskName = 'change_delivery_address'
    message = 'Cambia la dirección del pedido 1844 a la dirección Calle Nueva 25, Madrid'
}
if ($Confirm) { $null = Confirm-LabProposal -BaseUrl $BaseUrl -Proposal $proposal -UserId $UserId }
