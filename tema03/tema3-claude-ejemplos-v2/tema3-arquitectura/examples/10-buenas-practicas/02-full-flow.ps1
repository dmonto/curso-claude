$baseUrl = "http://localhost:3000"

"1. Crear sesión"
$sessionBody = @{
  requestId = "req-10-session"
  userId = "user-001"
  clientContext = @{
    currentPage = "orders"
    selectedEntityType = "order"
    selectedEntityId = "ORD-1002"
    locale = "es-ES"
  }
} | ConvertTo-Json -Depth 5
$session = Invoke-RestMethod -Uri "$baseUrl/api/assistant/sessions" -Method POST -ContentType "application/json" -Body $sessionBody
$sessionId = $session.data.session.sessionId
$session | ConvertTo-Json -Depth 8

"2. Enviar mensaje contextual"
$msg1 = @{
  requestId = "req-10-contextual"
  userId = "user-001"
  sessionId = $sessionId
  message = "Resume el pedido que estoy viendo e indica si tiene incidencias."
  clientContext = @{
    currentPage = "orders"
    selectedEntityType = "order"
    selectedEntityId = "ORD-1002"
    locale = "es-ES"
  }
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$baseUrl/api/assistant/message" -Method POST -ContentType "application/json" -Body $msg1 | ConvertTo-Json -Depth 10

"3. Crear acción pendiente"
$msg2 = @{
  requestId = "req-10-action"
  userId = "user-001"
  sessionId = $sessionId
  message = "Crea una incidencia para el pedido que estoy viendo."
  clientContext = @{
    currentPage = "orders"
    selectedEntityType = "order"
    selectedEntityId = "ORD-1002"
    locale = "es-ES"
  }
} | ConvertTo-Json -Depth 5
$response = Invoke-RestMethod -Uri "$baseUrl/api/assistant/message" -Method POST -ContentType "application/json" -Body $msg2
$response | ConvertTo-Json -Depth 10
$actionId = $response.data.pendingAction.actionId

"4. Confirmar acción"
$confirmBody = @{
  requestId = "req-10-confirm"
  userId = "user-001"
  sessionId = $sessionId
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$baseUrl/api/assistant/actions/$actionId/confirm" -Method POST -ContentType "application/json" -Body $confirmBody | ConvertTo-Json -Depth 10

"5. Métricas"
Invoke-RestMethod -Uri "$baseUrl/api/assistant/metrics" -Method GET | ConvertTo-Json -Depth 10

"6. Auditoría"
Invoke-RestMethod -Uri "$baseUrl/api/audit/events" -Method GET | ConvertTo-Json -Depth 12

"7. Arquitectura"
Invoke-RestMethod -Uri "$baseUrl/api/assistant/architecture" -Method GET | ConvertTo-Json -Depth 10
