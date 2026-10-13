param([string]$BaseUrl = 'http://localhost:3000', [switch]$RunActions)
$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$health = Invoke-RestMethod -Method Get -Uri "$BaseUrl/health"
$health | ConvertTo-Json -Depth 20
if ($health.status -ne 'ok') { throw 'Health no es OK.' }
$headers = @{ 'x-demo-user' = 'ana' }
if ($health.authMode -eq 'jwt') {
    $body = @{ username = 'ana'; password = 'ana123' } | ConvertTo-Json -Depth 10
    $login = Invoke-RestMethod -Method Post -Uri "$BaseUrl/auth/login" -ContentType 'application/json' -Body $body
    $login | Select-Object tokenType, user | ConvertTo-Json -Depth 20
    $headers = @{ Authorization = "Bearer $($login.accessToken)" }
    try {
        Invoke-RestMethod -Method Get -Uri "$BaseUrl/api/me/capabilities" | ConvertTo-Json -Depth 20
        throw 'Se ha permitido una petición sin token.'
    } catch {
        if ($null -eq $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 401) { throw }
        Write-Host '401 esperado: endpoint protegido sin token.'
    }
}
$body = @{ message = 'Consulta el pedido PED-1001' } | ConvertTo-Json -Depth 10
$response = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/assistant" `
    -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
$response | ConvertTo-Json -Depth 30
if ($response.toolCalls -lt 1 -or -not $response.toolResults[0].result.ok) { throw 'No se ha consultado la API correctamente.' }
if ($response.toolResults[0].result.data.order.orderId -ne 'PED-1001') { throw 'Pedido incorrecto.' }
if ($response.mode -eq 'mock') { Write-Host 'Modo mock: estas pruebas no llaman a Claude.' }
$body = @{ message = 'Consulta el pedido PED-2001' } | ConvertTo-Json -Depth 10
$foreign = Invoke-RestMethod -Method Post -Uri "$BaseUrl/api/assistant" `
    -Headers $headers -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
$foreign | ConvertTo-Json -Depth 30
if ($foreign.toolResults.Count -gt 0 -and $foreign.toolResults[0].result.ok) { throw 'Fallo de aislamiento entre tenants.' }
if ($RunActions) { & "$PSScriptRoot/Invoke-Backend.ps1" -BaseUrl $BaseUrl -RunActions }
Write-Host "Smoke test OK: $($health.version)"
