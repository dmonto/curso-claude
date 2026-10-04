$baseUrl = "http://localhost:3000"

"CAPABILITIES"
Invoke-RestMethod -Uri "$baseUrl/api/assistant/capabilities" -Method GET | ConvertTo-Json -Depth 10

$sessionBody = @{
  requestId = "req-06-session"
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
  requestId = "req-06-message"
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

$response = Invoke-RestMethod -Uri "$baseUrl/api/assistant/message" -Method POST -ContentType "application/json" -Body $messageBody
$response | ConvertTo-Json -Depth 10

$actionId = $response.data.pendingAction.actionId
$messageId = $response.data.messageId

"GET ACTION"
Invoke-RestMethod -Uri "$baseUrl/api/assistant/actions/$actionId?userId=user-001" -Method GET | ConvertTo-Json -Depth 10

"CANCEL ACTION"
$cancelBody = @{
  requestId = "req-06-cancel"
  userId = "user-001"
  sessionId = $sessionId
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$baseUrl/api/assistant/actions/$actionId/cancel" -Method POST -ContentType "application/json" -Body $cancelBody | ConvertTo-Json -Depth 10

"FEEDBACK"
$feedbackBody = @{
  requestId = "req-06-feedback"
  sessionId = $sessionId
  messageId = $messageId
  rating = "positive"
  comment = "Respuesta clara en la prueba de endpoints."
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$baseUrl/api/assistant/feedback" -Method POST -ContentType "application/json" -Body $feedbackBody | ConvertTo-Json -Depth 10
