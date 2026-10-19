param([string]$BaseUrl='http://127.0.0.1:3000')
$ErrorActionPreference='Stop'
Invoke-RestMethod "$BaseUrl/health" | ConvertTo-Json -Depth 20
$body = @{message='Resume los tickets críticos y propone el siguiente paso'} | ConvertTo-Json -Depth 20
1..2 | ForEach-Object {
 Invoke-RestMethod "$BaseUrl/api/assistant/message" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) | ConvertTo-Json -Depth 20
}
Invoke-RestMethod "$BaseUrl/api/metrics" | ConvertTo-Json -Depth 20
