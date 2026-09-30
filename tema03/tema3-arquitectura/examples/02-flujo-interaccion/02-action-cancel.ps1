$baseUrl = "http://localhost:3000"

$sessionBody = @{
  requestId = "req-02-cancel-session"
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

$messageBody = @{
  requestId = "req-02-cancel-propose"
  userId = "user-001"
  sessionId = $sessionId
  message = "Abrir incidencia sobre este pedido."
  clientContext = @{
    currentPage = "orders"
    selectedEntityType = "order"
    selectedEntityId = "ORD-1002"
    locale = "es-ES"
  }
} | ConvertTo-Json -Depth 5

$response = Invoke-RestMethod -Uri "$baseUrl/api/assistant/message" -Method POST -ContentType "application/json" -Body $messageBody
$actionId = $response.data.pendingAction.actionId

$cancelBody = @{
  requestId = "req-02-cancel"
  userId = "user-001"
  sessionId = $sessionId
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "$baseUrl/api/assistant/actions/$actionId/cancel" -Method POST -ContentType "application/json" -Body $cancelBody | ConvertTo-Json -Depth 10
