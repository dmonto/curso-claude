# Probar una respuesta correcta generada por Claude y validada
$decision = @{
  action = "create_ticket_draft"
  affectedService = "erp"
  priority = "high"
  requiresConfirmation = $true
  alreadyExecuted = $false
  missingFields = @()
}

$body = @{
  styleProfileName = "end_user_support"
  decision = $decision
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/validated-styled-response" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

# Probar validación directa de texto peligroso
$decision = @{
  action = "create_ticket_draft"
  affectedService = "erp"
  priority = "high"
  requiresConfirmation = $true
  alreadyExecuted = $false
  missingFields = @()
}

$body = @{
  styleProfileName = "end_user_support"
  decision = $decision
  responseText = "He creado el ticket de prioridad alta para el ERP. Se resolverá en breve."
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/validate-text-only" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10
