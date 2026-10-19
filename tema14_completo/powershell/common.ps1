$ErrorActionPreference = 'Stop'
function Invoke-LabPost {
 param([hashtable]$Body, [string]$BaseUrl='http://127.0.0.1:3000')
 if (-not $Body.requestId) { $Body.requestId = [guid]::NewGuid().ToString() }
 $json = $Body | ConvertTo-Json -Depth 20
 $result = Invoke-RestMethod -Uri "$BaseUrl/api/assistant" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([System.Text.Encoding]::UTF8.GetBytes($json))
 $result | ConvertTo-Json -Depth 20 | Write-Host
 return $result
}
function Invoke-LabAction {
 param($Reply, $Action, [string]$BaseUrl='http://127.0.0.1:3000')
 return Invoke-LabPost -BaseUrl $BaseUrl -Body @{ conversationId=$Reply.conversationId; message=$Action.label; actionIntent=$Action.intent; actionPayload=$Action.payload }
}
