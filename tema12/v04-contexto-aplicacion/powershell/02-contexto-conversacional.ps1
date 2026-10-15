
param([string]$BaseUrl='http://127.0.0.1:3000')
. $PSScriptRoot\common.ps1
$cid=New-LabConversation
$body=@{ conversationId=$cid; message='Muéstrame mi último ticket abierto'; appContext=@{ route='/support'; appArea='support'; view='dashboard'; activeEntity=@{ type='none' } } }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body $body
$body=@{ conversationId=$cid; message='¿Lo puedo cerrar?'; appContext=@{ route='/support/tickets/INC-1042'; appArea='support'; view='ticket_detail'; activeEntity=@{ type='ticket'; id='INC-1042' } } }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body $body
