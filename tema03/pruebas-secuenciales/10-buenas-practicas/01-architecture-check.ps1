$baseUrl = "http://localhost:3000"
Invoke-RestMethod -Uri "$baseUrl/api/assistant/architecture" -Method GET | ConvertTo-Json -Depth 10
