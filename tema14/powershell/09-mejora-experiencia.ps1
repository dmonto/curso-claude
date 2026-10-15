param([string]$BaseUrl='http://127.0.0.1:3000', [switch]$Confirm)
. (Join-Path $PSScriptRoot 'common.ps1')
$conversation = [guid]::NewGuid().ToString()
$reply = Invoke-LabPost -BaseUrl $BaseUrl -Body @{conversationId=$conversation;message='Consulta';actionIntent='show_critical_tickets'}
$null = Invoke-LabPost -BaseUrl $BaseUrl -Body @{conversationId=$conversation;message='Valoración';actionIntent='feedback';actionPayload=@{messageId=$reply.message.id;rating=5}}
Invoke-RestMethod "$BaseUrl/api/ux/summary" | ConvertTo-Json -Depth 20
