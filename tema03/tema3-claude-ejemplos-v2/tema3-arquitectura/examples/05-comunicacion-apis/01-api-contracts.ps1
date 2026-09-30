$baseUrl = "http://localhost:3000"

"HEALTH"
Invoke-RestMethod -Uri "$baseUrl/health" -Method GET | ConvertTo-Json -Depth 8

"ORDER API"
Invoke-RestMethod -Uri "$baseUrl/api/orders/ORD-1002?userId=user-001" -Method GET | ConvertTo-Json -Depth 8

"TICKET API"
$ticketBody = @{
  requestId = "req-05-ticket"
  userId = "user-001"
  orderId = "ORD-1002"
  subject = "Nueva incidencia de prueba desde API"
  description = "Ticket creado desde prueba secuencial."
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Uri "$baseUrl/api/tickets" -Method POST -ContentType "application/json" -Body $ticketBody | ConvertTo-Json -Depth 8
