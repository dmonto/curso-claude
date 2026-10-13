# Probar control de contexto: empleado viendo su ticket
$body = @{
  taskType = "ticket_status"
  userId = "user-001"
  userRole = "employee"
  currentPage = "/tickets/TCK-1027"
  activeTicketId = "TCK-1027"
  userMessage = "¿Qué estado tiene esto?"
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/support-task" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

# Probar control de contexto: empleado intentando ver ticket ajeno
$body = @{
  taskType = "ticket_status"
  userId = "user-001"
  userRole = "employee"
  currentPage = "/tickets/TCK-2044"
  activeTicketId = "TCK-2044"
  userMessage = "¿Qué estado tiene este ticket?"
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/support-task" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

# Probar extracción con contexto mínimo
$body = @{
  taskType = "extract"
  userId = "user-001"
  userRole = "employee"
  currentPage = "/tickets/TCK-1027"
  activeTicketId = "TCK-1027"
  userMessage = "Desde las 9:30 aparece usuario bloqueado. También le pasa a Ana."
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/support-task" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10
