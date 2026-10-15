param([string]$BaseUrl = 'http://127.0.0.1:3000')
. (Join-Path $PSScriptRoot 'common.ps1')
foreach ($user in @('demo-agent', 'demo-readonly')) {
    $reply = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -UserId $user -Body @{
        conversationId = New-LabConversation
        taskName = 'cancel_order'
        message = 'Cancela el pedido 1842'
    }
    if ($user -eq 'demo-readonly' -and $reply.status -ne 'blocked') { throw 'No se ha aplicado el bloqueo esperado del perfil solo lectura.' }
}
