param(
    [string]$BaseUrl = 'http://localhost:3000',
    [ValidateSet('ana', 'soporte', 'operador', 'externo', 'sinpermisos')]
    [string]$Username = 'ana',
    [string]$Password = '',
    [string]$Message = 'Resume el pedido PED-1001 incluyendo cliente, facturación y tickets abiertos.',
    [switch]$RunActions
)
$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
if (-not $Password) { $Password = "${Username}123" }

# Primero detectamos la versión. v01-v04 usa x-demo-user; v05-v10 usa JWT.
$health = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health"
$health | ConvertTo-Json -Depth 20

$headers = @{}
if ($health.authMode -eq 'jwt') {
    $loginBody = @{ username = $Username; password = $Password } | ConvertTo-Json -Depth 10
    $login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" `
        -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($loginBody))
    # Conserva el token en una variable. Muestra la sesión como JSON sin imprimir credenciales.
    $login | Select-Object tokenType, user | ConvertTo-Json -Depth 20
    $headers = @{ Authorization = "Bearer $($login.accessToken)" }
} else {
    $headers = @{ 'x-demo-user' = $Username }
}

$capabilities = Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/me/capabilities" -Headers $headers
$capabilities | ConvertTo-Json -Depth 20

function Send-AssistantMessage {
    param([string]$Text)
    $body = @{ message = $Text } | ConvertTo-Json -Depth 10
    $response = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/assistant" `
        -ContentType 'application/json; charset=utf-8' -Headers $headers `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
    # Write-Host permite mostrar JSON y devolver un objeto, sin mezclar ambos en la variable.
    Write-Host ($response | ConvertTo-Json -Depth 30)
    return $response
}

$detail = Send-AssistantMessage -Text $Message
$search = Send-AssistantMessage -Text '¿Qué pedidos están retrasados?'
if ($capabilities.availableTools -contains 'search_invoices') {
    $invoices = Send-AssistantMessage -Text '¿Qué facturas vencidas tiene CUST-001?'
    $chain = Send-AssistantMessage -Text '¿El pedido PED-1001 pertenece a un cliente con facturas vencidas?'
}

# La lectura de un pedido de otro tenant debe quedar limitada por el backend.
$foreign = Send-AssistantMessage -Text $(if ($Username -eq 'externo') { 'Consulta PED-1001' } else { 'Consulta PED-2001' })

if ($RunActions) {
    if ($capabilities.availableTools -notcontains 'prepare_create_ticket') {
        throw 'El usuario o la versión no dispone de creación de tickets. Prueba con ana y v04-v10.'
    }
    $proposal = Send-AssistantMessage -Text 'Crea un ticket HIGH para revisar el retraso del pedido PED-1002.'
    if (-not $proposal.pendingActions -or $proposal.pendingActions.Count -eq 0) { throw 'No se ha preparado ninguna acción.' }
    $actionId = $proposal.pendingActions[0].actionId
    $confirmBody = @{ confirmed = $true } | ConvertTo-Json -Depth 10
    $execution = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/actions/$actionId/confirm" `
        -ContentType 'application/json; charset=utf-8' -Headers $headers `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($confirmBody))
    $execution | ConvertTo-Json -Depth 30

    # Repite la misma confirmación: debe devolver el mismo ticket, sin duplicarlo.
    $repeat = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/actions/$actionId/confirm" `
        -ContentType 'application/json; charset=utf-8' -Headers $headers `
        -Body ([System.Text.Encoding]::UTF8.GetBytes($confirmBody))
    $repeat | ConvertTo-Json -Depth 30
    if (-not $repeat.alreadyExecuted -or $repeat.result.ticketId -ne $execution.result.ticketId) {
        throw 'La comprobación de idempotencia ha fallado.'
    }
}

if ($health.features.performance -and $capabilities.user.roles -contains 'operations_manager') {
    $warm = Send-AssistantMessage -Text 'Vuelve a resumir el pedido PED-1001.'
    Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/admin/performance" -Headers $headers | ConvertTo-Json -Depth 30
}
