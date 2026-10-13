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
    # Compatible con Windows PowerShell 5.1: conserva acentos mediante UTF-8.
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    $result = Invoke-RestMethod -Uri ($BaseUrl.TrimEnd('/') + $Path) -Method Post -Headers $headers -ContentType 'application/json; charset=utf-8' -Body $bytes
    $result | ConvertTo-Json -Depth 30 | Write-Host
    return $result
}

function Confirm-LabProposal {
    param([string]$BaseUrl, [object]$Proposal, [string]$UserId = 'demo-agent', [ValidateSet('confirm','cancel')][string]$Decision = 'confirm')
    if (-not $Proposal.pendingAction) { throw 'No hay propuesta pendiente. Revisa la respuesta anterior y el estado del pedido.' }
    return Invoke-LabPost -BaseUrl $BaseUrl -Path '/api/agent/confirm' -UserId $UserId -Body @{
        conversationId = $Proposal.conversationId
        actionId = $Proposal.pendingAction.actionId
        decision = $Decision
    }
}

function New-LabConversation { return [guid]::NewGuid().ToString('N') }
