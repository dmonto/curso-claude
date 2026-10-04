# Probar perfil de usuario final
$decision = @{
  action = "ask_missing_fields"
  affectedService = "erp"
  priority = "high"
  missingFields = @("startedAt", "errorMessage")
  alreadyExecuted = $false
  requiresConfirmation = $false
}

$body = @{
  styleProfileName = "end_user_support"
  decision = $decision
  responseContext = @{
    currentPage = "/support/new"
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/styled-response" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

# Probar perfil técnico para soporte
$decision = @{
  action = "create_ticket_draft"
  affectedService = "erp"
  priority = "high"
  missingFields = @()
  knownFields = @{
    startedAt = "09:30"
    errorMessage = "usuario bloqueado"
    businessImpact = "no puede facturar pedidos"
  }
  requiresConfirmation = $true
  alreadyExecuted = $false
}

$body = @{
  styleProfileName = "support_agent"
  decision = $decision
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/styled-response" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

# Probar perfil ejecutivo
$decision = @{
  action = "summarize_incident"
  affectedService = "erp"
  priority = "high"
  businessImpact = "bloqueo de facturación"
  currentStatus = "pendiente de confirmación para crear borrador"
  riskLevel = "high"
}

$body = @{
  styleProfileName = "executive_summary"
  decision = $decision
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/styled-response" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10

# Probar rechazo seguro
$decision = @{
  action = "unsupported"
  requestedAction = "close_all_tickets"
  reason = "Cerrar tickets no está permitido desde esta automatización"
  alternative = "puedo ayudarte a listar los tickets pendientes o preparar una solicitud para soporte"
}

$body = @{
  styleProfileName = "safe_refusal"
  decision = $decision
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:3000/api/assistant/styled-response" `
  -ContentType "application/json" `
  -Body $body | ConvertTo-Json -Depth 10
