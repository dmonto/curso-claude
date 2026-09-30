$baseUrl = "http://localhost:3000"

$sessionBody = @{
  requestId = "req-07-session"
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

$body = @{
  requestId = "req-07-message"
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

Invoke-RestMethod -Uri "$baseUrl/api/assistant/message" -Method POST -ContentType "application/json" -Body $body | ConvertTo-Json -Depth 10

"AUDIT EVENTS"
Invoke-RestMethod -Uri "$baseUrl/api/audit/events" -Method GET | ConvertTo-Json -Depth 12
