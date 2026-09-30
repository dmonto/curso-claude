$baseUrl = "http://localhost:3000"

$sessionBody = @{
  requestId = "req-04-session"
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

$messages = @(
  "Resume el pedido que estoy viendo.",
  "¿Tiene incidencias abiertas?",
  "¿Puedo crear una nueva?"
)

foreach ($message in $messages) {
  $body = @{
    requestId = "req-04-$([guid]::NewGuid().ToString())"
    userId = "user-001"
    sessionId = $sessionId
    message = $message
    clientContext = @{
      currentPage = "orders"
      selectedEntityType = "order"
      selectedEntityId = "ORD-1002"
      locale = "es-ES"
    }
  } | ConvertTo-Json -Depth 5

  Invoke-RestMethod -Uri "$baseUrl/api/assistant/message" -Method POST -ContentType "application/json" -Body $body | Out-Null
}

Invoke-RestMethod -Uri "$baseUrl/api/assistant/sessions/$sessionId/context" -Method GET | ConvertTo-Json -Depth 10
