# Probar consulta de listado
$body = @{
  userId = "user-001"
  userRole = "employee"
  userMessage = "Enséñame mis tickets abiertos de ERP."
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/data-query" `
  -ContentType "application/json" `
  -Body $body

# Probar consulta de conteo
$body = @{
  userId = "user-001"
  userRole = "employee"
  userMessage = "¿Cuántos tickets tengo pendientes?"
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/data-query" `
  -ContentType "application/json" `
  -Body $body

# Probar consulta agrupada
$body = @{
  userId = "user-001"
  userRole = "employee"
  userMessage = "Agrupa mis tickets por estado."
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/data-query" `
  -ContentType "application/json" `
  -Body $body

# Probar aislamiento por permisos como empleado
$body = @{
  userId = "user-001"
  userRole = "employee"
  userMessage = "Enséñame todos los tickets críticos abiertos."
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/data-query" `
  -ContentType "application/json" `
  -Body $body

# Probar aislamiento por permisos como admin
$body = @{
  userId = "admin-001"
  userRole = "admin"
  userMessage = "Enséñame todos los tickets críticos abiertos."
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/data-query" `
  -ContentType "application/json" `
  -Body $body
