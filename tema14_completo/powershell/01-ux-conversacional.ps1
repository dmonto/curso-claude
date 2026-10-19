param([string]$BaseUrl='http://127.0.0.1:3000', [switch]$Confirm)
. (Join-Path $PSScriptRoot 'common.ps1')
$conversation = [guid]::NewGuid().ToString()
$reply = Invoke-LabPost -BaseUrl $BaseUrl -Body @{conversationId=$conversation;message='Ejemplo apartado 1';actionIntent='show_critical_tickets'}
