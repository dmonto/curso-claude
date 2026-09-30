$baseUrl = "http://localhost:3000"

$sessionBody = @{
  requestId = "req-08-session"
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

for ($i = 1; $i -le 12; $i++) {
  $body = @{
    requestId = "req-08-$i"
    userId = "user-001"
    sessionId = $sessionId
    message = "Mensaje de prueba de rate limit número $i"
    clientContext = @{
      currentPage = "orders"
      selectedEntityType = "order"
      selectedEntityId = "ORD-1002"
      locale = "es-ES"
    }
  } | ConvertTo-Json -Depth 5

  try {
    $result = Invoke-RestMethod -Uri "$baseUrl/api/assistant/message" -Method POST -ContentType "application/json" -Body $body
    "[$i] OK: $($result.data.elapsedMs) ms"
  }
  catch {
    "[$i] ERROR: $($_.ErrorDetails.Message)"
  }
}

"METRICS"
Invoke-RestMethod -Uri "$baseUrl/api/assistant/metrics" -Method GET | ConvertTo-Json -Depth 10
