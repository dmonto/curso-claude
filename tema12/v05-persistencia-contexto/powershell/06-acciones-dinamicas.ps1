
param([string]$BaseUrl='http://127.0.0.1:3000')
. $PSScriptRoot\common.ps1
$cid=New-LabConversation
$appContext=@{ route='/support/tickets/INC-1042'; appArea='support'; view='ticket_detail'; activeEntity=@{ type='ticket'; id='INC-1042' } }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body @{ conversationId=$cid; message='Resume este ticket'; appContext=$appContext }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body @{ conversationId=$cid; message='Añade una nota diciendo que el cliente confirma que el problema sigue ocurriendo'; appContext=$appContext }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body @{ conversationId=$cid; message='¿Qué acaba de pasar?'; appContext=$appContext }
