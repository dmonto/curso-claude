$baseUrl = "http://localhost:3000"

$body = @{
  userId = "user-001"
  sessionId = "session-02"
  message = "Crea una incidencia para el pedido que estoy viendo porque lleva varios días en preparación."
  clientContext = @{
    currentPage = "orders"
    selectedEntityType = "order"
    selectedEntityId = "ORD-1002"
    locale = "es-ES"
  }
} | ConvertTo-Json -Depth 5

$response = Invoke-RestMethod `
  -Uri "$baseUrl/api/assistant/message" `
  -Method POST `
  -ContentType "application/json" `
  -Body $body

$response | ConvertTo-Json -Depth 10

$actionId = $response.pendingAction.actionId
"ACTION_ID=$actionId"

$confirmBody = @{
  userId = "user-001"
  sessionId = "session-02"
  actionId = $actionId
  confirm = $true
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Uri "$baseUrl/api/assistant/confirm-action" `
  -Method POST `
  -ContentType "application/json" `
  -Body $confirmBody | ConvertTo-Json -Depth 10
