
param([string]$BaseUrl='http://127.0.0.1:3000')
. $PSScriptRoot\common.ps1
$cid=New-LabConversation
$appContext=@{ route='/support/tickets/INC-1042'; appArea='support'; view='ticket_detail'; activeEntity=@{ type='ticket'; id='INC-1042' }; activeTab='activity'; filters=@{}; selectedRows=@(); draftState=@{ hasUnsavedChanges=$false } }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body @{ conversationId=$cid; message='Resume este ticket'; debugTokens=$true; appContext=$appContext }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body @{ conversationId=$cid; message='Añade una nota diciendo que el cliente confirma que sigue ocurriendo'; appContext=$appContext }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body @{ conversationId=$cid; message='¿Puedo cerrarlo?'; appContext=$appContext }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body @{ conversationId=$cid; message='Sí, confirmo'; appContext=$appContext }
Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/context/quality' -Body @{ conversationId=$cid; appContext=$appContext; autoFix=$true }
Invoke-LabGet -BaseUrl $BaseUrl -Path "/api/context/$cid/events"
