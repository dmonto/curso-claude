
param([string]$BaseUrl='http://127.0.0.1:3000')
. $PSScriptRoot\common.ps1
$cid=New-LabConversation
$appContext=@{ route='/support/tickets/INC-1042'; appArea='support'; view='ticket_detail'; activeEntity=@{ type='ticket'; id='INC-1042' }; filters=@{ status='open'; priority='high' }; selectedRows=@('INC-1042','INC-1031') }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body @{ conversationId=$cid; message='Resume este ticket'; debugTokens=$true; appContext=$appContext }
$appContext.activeEntity.id='INC-1077'; $appContext.route='/support/tickets/INC-1077'
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body @{ conversationId=$cid; message='¿Qué ticket estoy viendo ahora?'; debugTokens=$true; appContext=$appContext }
