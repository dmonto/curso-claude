param(
    [string]$BaseUrl = 'http://127.0.0.1:3000',
    [string]$OrderId = '1845',
    [ValidateSet('List','Approve','Reject')][string]$Decision = 'List',
    [string]$Reason = 'Pedido revisado en el laboratorio'
)
. (Join-Path $PSScriptRoot 'common.ps1')
$proposal = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -UserId 'demo-agent' -Body @{
    conversationId = New-LabConversation
    taskName = 'cancel_order'
    message = "Cancela el pedido $OrderId"
}
$confirmation = Confirm-LabProposal -BaseUrl $BaseUrl -Proposal $proposal -UserId 'demo-agent'
if ($confirmation.status -ne 'waiting_approval') { throw 'No se obtuvo una solicitud pendiente de aprobación.' }
$null = Invoke-LabGet -BaseUrl $BaseUrl -Path '/api/supervisor/approvals' -UserId 'demo-supervisor'
if ($Decision -ne 'List') {
    $approvalId = $confirmation.approvalId
    $endpoint = "/api/supervisor/approvals/$approvalId/$($Decision.ToLowerInvariant())"
    $null = Invoke-LabPost -BaseUrl $BaseUrl -Path $endpoint -UserId 'demo-supervisor' -Body @{ reason = $Reason }
}
