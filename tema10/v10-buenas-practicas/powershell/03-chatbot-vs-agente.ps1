param([string]$BaseUrl = 'http://127.0.0.1:3000', [string]$UserId = 'demo-agent')
. (Join-Path $PSScriptRoot 'common.ps1')
$null = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chatbot' -UserId $UserId -Body @{
    conversationId = New-LabConversation
    message = 'Cancela el pedido 1842'
}
$null = Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent' -UserId $UserId -Body @{
    conversationId = New-LabConversation
    message = 'Cancela el pedido 1842'
}
