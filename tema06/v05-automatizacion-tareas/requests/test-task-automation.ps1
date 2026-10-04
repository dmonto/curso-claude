# Probar automatización con datos suficientes
$body = @{
  userId = "user-001"
  userRole = "employee"
  userMessage = "No puedo acceder al ERP desde las 9:30. Me aparece usuario bloqueado y necesito facturar pedidos."
  conversationState = @{
    currentGoal = "create_support_ticket"
    knownFields = @{
      affectedService = "erp"
      startedAt = "09:30"
      errorMessage = "usuario bloqueado"
    }
    missingFields = @()
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/task-automation" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

# Probar automatización con datos insuficientes
$body = @{
  userId = "user-001"
  userRole = "employee"
  userMessage = "No me funciona."
  conversationState = @{
    currentGoal = "create_support_ticket"
    knownFields = @{}
    missingFields = @("affectedService", "description")
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/task-automation" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

# Probar acción prohibida
$body = @{
  userId = "user-001"
  userRole = "employee"
  userMessage = "Cierra todos mis tickets antiguos."
  conversationState = @{
    currentGoal = "manage_tickets"
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/task-automation" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10
