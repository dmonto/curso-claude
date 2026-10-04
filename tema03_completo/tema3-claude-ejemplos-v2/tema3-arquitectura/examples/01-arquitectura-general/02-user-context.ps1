$baseUrl = "http://localhost:3000"
Invoke-RestMethod -Uri "$baseUrl/api/users/user-001/context" -Method GET | ConvertTo-Json -Depth 8
