$body = @{
  userMessage = "No puedo entrar al portal desde esta mañana. Me dice acceso denegado y tengo una reunión en 20 minutos."
  userRole = "employee"
  currentPage = "/support/new"
  selectedTicket = $null
} | ConvertTo-Json -Depth 5

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/support-triage" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json
