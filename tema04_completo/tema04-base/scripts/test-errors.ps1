$messages = @(
  "simula 403",
  "simula 429",
  "simula 500",
  "bad response"
)

foreach ($message in $messages) {
  Write-Host "Probando: $message"

  $body = @{
    conversationId = "conv-error-test"
    message = $message
    screenContext = @{
      route = "/tickets/INC-1024"
      entity = @{
        type = "ticket"
        id = "INC-1024"
      }
    }
  } | ConvertTo-Json -Depth 8

  try {
    Invoke-RestMethod `
      -Uri "http://localhost:3000/api/assistant/messages" `
      -Method Post `
      -ContentType "application/json" `
      -Body $body
  } catch {
    $_.ErrorDetails.Message
  }
}
