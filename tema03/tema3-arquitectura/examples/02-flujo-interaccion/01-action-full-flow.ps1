$baseUrl = "http://localhost:3000"

$sessionBody = @{
  requestId = "req-02-session"
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
  requestId = "req-02-propose"
  userId = "user-001"
  sessionId = $sessionId
  message = "Crea una incidencia para el pedido que estoy viendo porque lleva varios días en preparación."
  clientContext = @{
    currentPage = "orders"
    selectedEntityType = "order"
    selectedEntityId = "ORD-1002"
    locale = "es-ES"
  }
} | ConvertTo-Json -Depth 5

$response = Invoke-RestMethod -Uri "$baseUrl/api/assistant/message" -Method POST -ContentType "application/json" -Body $messageBody
$response | ConvertTo-Json -Depth 10

$actionId = $response.data.pendingAction.actionId
"ACTION_ID=$actionId"

$confirmBody = @{
  requestId = "req-02-confirm"
  userId = "user-001"
  sessionId = $sessionId
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "$baseUrl/api/assistant/actions/$actionId/confirm" -Method POST -ContentType "application/json" -Body $confirmBody | ConvertTo-Json -Depth 10
