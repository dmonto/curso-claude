$ErrorActionPreference = 'Stop'
function Invoke-LabGet([string]$Path) {
 Invoke-RestMethod -Uri "$BaseUrl$Path" -TimeoutSec 60 | ConvertTo-Json -Depth 30
}
function Invoke-LabPost([string]$Path, $Data) {
 $json = $Data | ConvertTo-Json -Depth 30
 $result = Invoke-RestMethod -Uri "$BaseUrl$Path" -Method Post -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($json)) -TimeoutSec 60
 $result | ConvertTo-Json -Depth 30 | Write-Host
 return $result
}
