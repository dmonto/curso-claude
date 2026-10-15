param([string]$BaseUrl = 'http://127.0.0.1:3000', [string]$OrderId = '1842', [string]$UserId = 'demo-agent', [switch]$Confirm)
. (Join-Path $PSScriptRoot 'common.ps1')
$proposal = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -UserId $UserId -Body @{
    conversationId = New-LabConversation
    taskName = 'cancel_order'
    message = "Cancela el pedido $OrderId"
}
if ($Confirm) { $null = Confirm-LabProposal -BaseUrl $BaseUrl -Proposal $proposal -UserId $UserId }
