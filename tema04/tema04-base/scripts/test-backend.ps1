$body = @{
  conversationId = "conv-powershell-test"
  message = "Resume este ticket y dime qué falta para escalarlo"
  screenContext = @{
    route = "/tickets/INC-1024"
    pageKey = "ticket-detail"
    entity = @{
      type = "ticket"
      id = "INC-1024"
      label = "Errores intermitentes en pagos"
    }
    selection = @{
      tab = "details"
    }
    client = @{
      locale = "es-ES"
      timezone = "Europe/Madrid"
      appVersion = "1.0.0"
    }
  }
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Uri "http://localhost:3000/api/assistant/messages" `
  -Method Post `
  -ContentType "application/json" `
  -Body $body
