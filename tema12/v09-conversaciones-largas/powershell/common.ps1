Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-LabGet {
    param([string]$BaseUrl, [string]$Path, [string]$UserId = 'demo-agent')
    $headers = @{ 'x-user-id' = $UserId }
    $result = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + $Path) -Method Get -Headers $headers
    $result | ConvertTo-Json -Depth 30 | Write-Host
    return $result
}

function Invoke-LabPost {
    param([string]$BaseUrl, [string]$Path, [hashtable]$Body, [string]$UserId = 'demo-agent')
    $headers = @{ 'x-user-id' = $UserId }
    $json = $Body | ConvertTo-Json -Depth 30
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $result = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + $Path) -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes
    $result | ConvertTo-Json -Depth 30 | Write-Host
    return $result
}

function New-LabConversation { return [guid]::NewGuid().ToString('N') }
