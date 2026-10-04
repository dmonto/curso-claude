# Reiniciar sesión
$body = @{
  sessionId = "session-demo-001"
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/guided-support/reset" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

# Turno 1
$body = @{
  sessionId = "session-demo-001"
  userId = "user-001"
  userRole = "employee"
  currentPage = "/support/new"
  userMessage = "No puedo entrar al ERP. Me aparece usuario bloqueado."
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/guided-support" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

# Turno 2
$body = @{
  sessionId = "session-demo-001"
  userId = "user-001"
  userRole = "employee"
  currentPage = "/support/new"
  userMessage = "Alto, no puedo facturar pedidos."
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/guided-support" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

# Turno 3
$body = @{
  sessionId = "session-demo-001"
  userId = "user-001"
  userRole = "employee"
  currentPage = "/support/new"
  userMessage = "Desde las 9:30."
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/guided-support" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

# Conectar interacción guiada con automatización
$body = @{
  userId = "user-001"
  userRole = "employee"
  userMessage = "Preparar borrador con los datos recogidos."
  conversationState = @{
    currentGoal = "create_support_ticket"
    knownFields = @{
      affectedService = "erp"
      description = "No puedo entrar al ERP. Me aparece usuario bloqueado."
      businessImpact = "high"
      errorMessage = "usuario bloqueado"
      startedAt = "9:30"
    }
    missingFields = @()
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/task-automation" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10
