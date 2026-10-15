
param([string]$BaseUrl='http://127.0.0.1:3000')
. $PSScriptRoot\common.ps1
$cid=New-LabConversation
$appContext=@{ route='/support/tickets/INC-1042'; appArea='support'; view='ticket_detail'; activeEntity=@{ type='ticket'; id='INC-1042' } }
$messages=@('Resume este ticket','¿Qué tareas pendientes tiene?','Añade una nota diciendo que el cliente confirma que el problema sigue ocurriendo','¿Qué acaba de pasar?','¿Qué siguiente paso recomiendas?','¿Puedo cerrarlo?','Todavía no lo cierres','Explícame el estado actual','¿Qué datos estás usando?','¿Qué acción fue la última?','¿Hay algo pendiente?','Resume toda la conversación','Ahora dime qué debería hacer soporte')
foreach($m in $messages){ Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/chat' -Body @{ conversationId=$cid; message=$m; appContext=$appContext } | Out-Null }
Invoke-LabGet -BaseUrl $BaseUrl -Path "/api/context/$cid"
Invoke-LabGet -BaseUrl $BaseUrl -Path "/api/context/$cid/segments"
