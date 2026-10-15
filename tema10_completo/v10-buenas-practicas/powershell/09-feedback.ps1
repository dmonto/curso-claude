param([string]$BaseUrl = 'http://127.0.0.1:3000', [string]$UserId = 'demo-agent')
. (Join-Path $PSScriptRoot 'common.ps1')
$reply = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -UserId $UserId -Body @{
    conversationId = New-LabConversation
    message = 'Consulta el pedido 1843'
}
$null = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent/feedback' -UserId $UserId -Body @{
    conversationId = $reply.conversationId
    taskName = $reply.taskName
    rating = 4
    comment = 'La consulta fue clara y las herramientas dejaron evidencia.'
    resolved = $true
}
