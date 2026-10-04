# Probar tarea de clasificación
$body = @{
  taskType = "classify"
  userMessage = "No puedo entrar al ERP y necesito facturar pedidos antes de las 12."
  userRole = "employee"
  currentPage = "/support/new"
  affectedService = "erp"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/support-task" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10


# Probar tarea de extracción
$body = @{
  taskType = "extract"
  userMessage = "Desde las 9:30 no puedo acceder al ERP. Me aparece usuario bloqueado. Le pasa también a Ana."
  userRole = "employee"
  currentPage = "/support/new"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/support-task" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10


# Probar tarea de redacción
$decision = @{
  action = "create_ticket_draft"
  affectedService = "erp"
  priority = "high"
  missingFields = @("captura del error", "confirmar si afecta a más usuarios")
  alreadyExecuted = $false
}

$body = @{
  taskType = "compose_reply"
  decision = $decision
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/support-task" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

