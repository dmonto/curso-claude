$baseUrl = "http://localhost:3000"

$sessionBody = @{
  requestId = "req-09-session"
  userId = "user-001"
  clientContext = @{
    currentPage = "orders"
    selectedEntityType = "order"
    selectedEntityId = "ORD-1002"
    locale = "es-ES"
  }
} | ConvertTo-Json -Depth 5

$session = Invoke-RestMethod -Uri "$baseUrl/api/assistant/sessions" -Method POST -ContentType "application/json" -Body $sessionBody
$session | ConvertTo-Json -Depth 8
$sessionId = $session.data.session.sessionId

"GET SESSION"
Invoke-RestMethod -Uri "$baseUrl/api/assistant/sessions/$sessionId?userId=user-001" -Method GET | ConvertTo-Json -Depth 8

"MESSAGE WITH ACTIVE SESSION"
$messageBody = @{
  requestId = "req-09-message"
  userId = "user-001"
  sessionId = $sessionId
  message = "Resume el pedido que estoy viendo."
  clientContext = @{
    currentPage = "orders"
    selectedEntityType = "order"
    selectedEntityId = "ORD-1002"
    locale = "es-ES"
  }
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$baseUrl/api/assistant/message" -Method POST -ContentType "application/json" -Body $messageBody | ConvertTo-Json -Depth 8

"CLOSE SESSION"
$closeBody = @{
  requestId = "req-09-close"
  userId = "user-001"
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Uri "$baseUrl/api/assistant/sessions/$sessionId" -Method DELETE -ContentType "application/json" -Body $closeBody | ConvertTo-Json -Depth 8

"MESSAGE WITH CLOSED SESSION"
try {
  Invoke-RestMethod -Uri "$baseUrl/api/assistant/message" -Method POST -ContentType "application/json" -Body $messageBody | ConvertTo-Json -Depth 8
}
catch {
  $_.ErrorDetails.Message
}
