
param([string]$BaseUrl='http://127.0.0.1:3000')
. $PSScriptRoot\common.ps1
$cid=New-LabConversation
$ctx=@{ route='/support/tickets/INC-1042'; appArea='support'; view='ticket_detail'; activeEntity=@{ type='ticket'; id='INC-1042' } }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body @{ conversationId=$cid; message='Resume este ticket'; appContext=$ctx }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body @{ conversationId=$cid; message='¿Qué acción fue la última?'; appContext=$ctx }
Invoke-LabGet -BaseUrl $BaseUrl -Path "/api/context/$cid"
