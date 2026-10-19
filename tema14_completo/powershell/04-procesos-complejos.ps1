param([string]$BaseUrl='http://127.0.0.1:3000', [switch]$Confirm)
. (Join-Path $PSScriptRoot 'common.ps1')
$conversation = [guid]::NewGuid().ToString()
$reply = Invoke-LabPost -BaseUrl $BaseUrl -Body @{conversationId=$conversation;message='Ejemplo apartado 4';actionIntent='start_incident_report'}
while ($reply.message.task.status -eq 'collecting') {
    $action = $reply.message.actions | Where-Object intent -eq 'flow_set' | Select-Object -First 1
    if (-not $action) { throw 'No hay una opción para el paso actual' }
    $reply = Invoke-LabAction -Reply $reply -Action $action -BaseUrl $BaseUrl
}
if ($reply.message.type -eq 'confirmation') {
    $intent = if ($Confirm) { 'confirm_note' } else { 'cancel' }
    $action = $reply.message.actions | Where-Object intent -eq $intent | Select-Object -First 1
    $null = Invoke-LabAction -Reply $reply -Action $action -BaseUrl $BaseUrl
}
