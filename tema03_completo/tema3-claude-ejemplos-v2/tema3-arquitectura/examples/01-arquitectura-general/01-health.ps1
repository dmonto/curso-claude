$baseUrl = "http://localhost:3000"
Invoke-RestMethod -Uri "$baseUrl/health" -Method GET | ConvertTo-Json -Depth 8
