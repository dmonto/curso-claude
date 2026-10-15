param([string]$BaseUrl = 'http://127.0.0.1:3000', [string]$UserId = 'demo-agent')
. (Join-Path $PSScriptRoot 'common.ps1')
$conversation = New-LabConversation
$null = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -UserId $UserId -Body @{
    conversationId = $conversation
    message = 'Consulta el pedido 1843'
}
$null = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -UserId $UserId -Body @{
    conversationId = $conversation
    message = 'Cancela ese pedido'
}
$null = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -UserId $UserId -Body @{
    conversationId = $conversation
    message = 'Recuerda que prefiero respuestas breves'
}
$null = Invoke-LabGet -BaseUrl $BaseUrl -Path "/api/agent/conversations/$conversation" -UserId $UserId
# La misma cadena de conversación, con otro usuario, no comparte memoria.
$null = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -UserId 'demo-readonly' -Body @{
    conversationId = $conversation
    message = 'Consulta ese pedido'
}
