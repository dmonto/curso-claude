param(
    [string]$BaseUrl = "http://localhost:3000",
    [ValidateSet("user-001", "user-002", "user-003", "user-004")][string]$DemoUser = "user-002"
)
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
$script:BaseUrl = $BaseUrl.TrimEnd('/')
$script:DemoUser = $DemoUser
. (Join-Path $PSScriptRoot "Helpers.ps1")

function New-ManualPlan {
    param([string]$Action, [hashtable]$Payload, [string]$User = $script:DemoUser)
    return Invoke-Lab -Path "/api/automation/plan" -DemoUser $User -Body @{
        analysis = @{
            is_automatable = $true
            automation_type = $Action
            reason = "Prueba practica"
            proposed_action = @{ action_name = $Action; payload = $Payload }
        }
    }
}

$health = Invoke-Lab -Path "/health"
Show-LabJson $health
$stage = [int]$health.stage
$localVersion = Get-Content (Join-Path $PSScriptRoot "../version.json") -Raw | ConvertFrom-Json
Assert-Lab ($health.version -eq $localVersion.version) "La version activa coincide con este directorio"
Write-Host "Ejecuta esta prueba con un backend recien arrancado para reproducir los datos iniciales." -ForegroundColor Cyan

$analysis = Invoke-Lab -Path "/api/automation/analyze" -Body @{
    message = "Crea un ticket de prioridad alta para ACME porque no puede acceder al portal corporativo"
}
Show-LabJson $analysis
Assert-Lab ($analysis.automation_type -eq "create_ticket") "Tarea reconocida"
$blocked = Invoke-Lab -Path "/api/automation/analyze" -Body @{ message = "Borra todos los tickets antiguos" }
Show-LabJson $blocked
Assert-Lab (-not $blocked.is_automatable) "La tarea destructiva no se prepara"

if ($stage -ge 2) {
    $plan = Invoke-Lab -Path "/api/automation/plan" -Body @{ analysis = $analysis }
    Show-LabJson $plan
    $dry = Invoke-Lab -Path "/api/automation/execute" -Body @{ flow_id = $plan.flow_id; dry_run = $true }
    Show-LabJson $dry
    $withoutConfirmation = Invoke-Lab -Path "/api/automation/execute" -ExpectedError "CONFIRMATION_REQUIRED" -Body @{ flow_id = $plan.flow_id }
    Show-LabJson $withoutConfirmation
    $done = Invoke-Lab -Path "/api/automation/execute" -Body @{ flow_id = $plan.flow_id; confirmed = $true }
    Show-LabJson $done
    Assert-Lab ($done.status -eq "executed") "Plan ejecutado"
    $duplicate = Invoke-Lab -Path "/api/automation/execute" -ExpectedError "IDEMPOTENCY_CONFLICT" -Body @{ flow_id = $plan.flow_id; confirmed = $true }
    Show-LabJson $duplicate
}
if ($stage -eq 3) {
    $assign = New-ManualPlan "assign_owner" @{ ticket_id = "TCK-1001"; owner_team = "soporte N2" }
    $assigned = Invoke-Lab -Path "/api/automation/execute" -Body @{ flow_id = $assign.flow_id; confirmed = $true }
    Show-LabJson $assigned
}
if ($stage -ge 4) {
    $invalidCustomer = New-ManualPlan "create_ticket" @{
        customer = "BlockedCorp"; priority = "medium"; category = "access"; summary = "El cliente no puede acceder al portal"
    }
    $businessBlock = Invoke-Lab -Path "/api/automation/execute" -ExpectedError "BUSINESS_RULE_BLOCKED" -Body @{ flow_id = $invalidCustomer.flow_id; dry_run = $true }
    Show-LabJson $businessBlock
    $urgent = New-ManualPlan "create_ticket" @{
        customer = "ACME"; priority = "urgent"; category = "access"; summary = "Interrupcion general del acceso al portal"
    } "user-001"
    Show-LabJson (Invoke-Lab -Path "/api/automation/execute" -DemoUser "user-001" -ExpectedError "BUSINESS_RULE_BLOCKED" -Body @{ flow_id = $urgent.flow_id; confirmed = $true })
}
if ($stage -ge 5 -and $stage -lt 9) {
    $batch = Invoke-Lab -Path "/api/automation/processes/stale-ticket-followup/plan" -Body @{ max_items = 10; stale_hours = 48 }
    Show-LabJson $batch
    Assert-Lab ($batch.total_candidates -eq 3) "Tres candidatos iniciales"
    Show-LabJson (Invoke-Lab -Path "/api/automation/processes/execute" -ExpectedError "DRY_RUN_REQUIRED" -Body @{ process_id = $batch.process_id; confirmed = $true })
    Show-LabJson (Invoke-Lab -Path "/api/automation/processes/execute" -Body @{ process_id = $batch.process_id; dry_run = $true })
    Show-LabJson (Invoke-Lab -Path "/api/automation/processes/execute" -Body @{ process_id = $batch.process_id; confirmed = $true })
}
if ($stage -ge 6) {
    $conversation = "ps-" + [guid]::NewGuid().ToString()
    $reply = Invoke-Lab -Path "/api/task-assistant/message" -Body @{ conversation_id = $conversation; message = "Crea un ticket de prioridad alta" }
    Show-LabJson $reply
    Assert-Lab ($reply.task_state -eq "collecting_data") "El asistente pide los datos que faltan"
    $reply = Invoke-Lab -Path "/api/task-assistant/message" -Body @{
        conversation_id = $conversation
        message = "Cliente ACME, categoria access, resumen: No puede acceder al portal corporativo"
    }
    Show-LabJson $reply
    Assert-Lab ($reply.task_state -eq "waiting_for_confirmation") "El asistente conserva los datos entre turnos"
    Show-LabJson (Invoke-Lab -Path "/api/task-assistant/confirm" -Body @{ conversation_id = $conversation; dry_run = $true })
    Show-LabJson (Invoke-Lab -Path "/api/task-assistant/confirm" -Body @{ conversation_id = $conversation; confirmed = $true })
}
if ($stage -ge 7) {
    $invalid = New-ManualPlan "create_ticket" @{
        customer = "ACME"; priority = "critical"; category = "access"; summary = "El usuario no puede acceder al portal"
    }
    Show-LabJson (Invoke-Lab -Path "/api/automation/execute" -ExpectedError "VALIDATION_ERROR" -Body @{ flow_id = $invalid.flow_id; confirmed = $true })
}
if ($stage -ge 9) {
    Show-LabJson (Invoke-Lab -Path "/api/demo/faults" -DemoUser "user-003" -Body @{ ticket_id = "TCK-1002"; mode = "always" })
    $batch = Invoke-Lab -Path "/api/automation/processes/stale-ticket-followup/plan" -Body @{ max_items = 10; stale_hours = 48 }
    Show-LabJson $batch
    Show-LabJson (Invoke-Lab -Path "/api/automation/processes/execute" -Body @{ process_id = $batch.process_id; dry_run = $true })
    $partial = Invoke-Lab -Path "/api/automation/processes/execute" -Body @{ process_id = $batch.process_id; confirmed = $true }
    Show-LabJson $partial
    Assert-Lab ($partial.summary.executed -eq 1 -and $partial.summary.blocked -eq 1 -and $partial.summary.failed -eq 1) "Lote parcial: ejecutado, bloqueado y timeout"
    Show-LabJson (Invoke-Lab -Path "/api/demo/faults" -DemoUser "user-003" -Body @{ ticket_id = "TCK-1002"; mode = "off" })
    $retry = Invoke-Lab -Path "/api/automation/processes/retry-failed" -Body @{ process_id = $batch.process_id; confirmed = $true }
    Show-LabJson $retry
    Assert-Lab ($retry.summary.failed -eq 0) "Solo se reintenta el elemento con error transitorio"
}
if ($stage -ge 8) {
    Show-LabJson (Invoke-Lab -Path "/api/automation/monitoring/summary")
    Show-LabJson (Invoke-Lab -Path "/api/automation/monitoring/events?limit=20")
    Show-LabJson (Invoke-Lab -Path "/api/automation/monitoring/events?status=blocked&limit=20")
}
if ($stage -ge 10) { Show-LabJson (Invoke-Lab -Path "/api/automation/readiness") }
if ($stage -ge 3) { Show-LabJson (Invoke-Lab -Path "/api/tickets") }
Write-Host ("Pruebas completadas para " + $health.version) -ForegroundColor Green
