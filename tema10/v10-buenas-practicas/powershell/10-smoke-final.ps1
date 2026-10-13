param([string]$BaseUrl = 'http://127.0.0.1:3000', [switch]$Confirm)
. (Join-Path $PSScriptRoot 'common.ps1')
$health = Invoke-LabGet -BaseUrl $BaseUrl -Path '/health'
if ($health.status -ne 'ok') { throw 'El backend no está saludable.' }
$checks = Invoke-LabGet -BaseUrl $BaseUrl -Path '/api/agent/checks'
if (-not $checks.checks.confirmationByActionId) { throw 'Falta confirmación por acción.' }
$reply = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -Body @{
    conversationId = New-LabConversation
    taskName = 'delivery_incident'
    message = 'El cliente no ha recibido el pedido 1843. Revisa la entrega.'
}
if ($reply.status -ne 'waiting_confirmation') { throw 'Se esperaba una propuesta pendiente.' }
if ($Confirm) {
    $result = Confirm-LabProposal -BaseUrl $BaseUrl -Proposal $reply
    if (-not $result.executionResult.success) { throw 'El ticket no se creó correctamente.' }
} else { $null = Confirm-LabProposal -BaseUrl $BaseUrl -Proposal $reply -Decision 'cancel' }
$null = Invoke-LabGet -BaseUrl $BaseUrl -Path '/api/demo/tickets'
Write-Host 'Smoke test completado.'
