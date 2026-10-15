function Show-LabJson {
    param([Parameter(Mandatory = $true)]$Value)
    $Value | ConvertTo-Json -Depth 30
}

function Assert-Lab {
    param([bool]$Condition, [string]$Message)
    if (-not $Condition) { throw "Prueba fallida: $Message" }
    Write-Host "OK: $Message" -ForegroundColor Green
}

function Invoke-Lab {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [hashtable]$Body = $null,
        [string]$DemoUser = $script:DemoUser,
        [string]$ExpectedError = ""
    )
    $request = @{
        Uri = $script:BaseUrl + $Path
        Method = "GET"
        Headers = @{ "X-Demo-User" = $DemoUser }
    }
    if ($null -ne $Body) {
        # ConvertTo-Json transforma el hashtable, incluidos los objetos anidados.
        $json = $Body | ConvertTo-Json -Depth 30
        $request.Method = "POST"
        $request.ContentType = "application/json; charset=utf-8"
        $request.Body = [System.Text.Encoding]::UTF8.GetBytes($json)
        Write-Host ("Peticion: " + $Path) -ForegroundColor Cyan
        Write-Host $json
    }
    try {
        $result = Invoke-RestMethod @request
        if ($ExpectedError) { throw "Se esperaba $ExpectedError, pero la peticion se ejecuto." }
        return $result
    } catch {
        $errorRecord = $_
        $text = ""
        if ($errorRecord.ErrorDetails) { $text = $errorRecord.ErrorDetails.Message }
        if (-not $text) {
            $property = $errorRecord.Exception.PSObject.Properties["Response"]
            if ($property -and $property.Value -and $property.Value.PSObject.Methods["GetResponseStream"]) {
                $reader = New-Object System.IO.StreamReader($property.Value.GetResponseStream())
                try { $text = $reader.ReadToEnd() } finally { $reader.Dispose() }
            }
        }
        $parsed = $null
        if ($text) { try { $parsed = $text | ConvertFrom-Json } catch { } }
        if ($ExpectedError -and $parsed -and $parsed.PSObject.Properties["error"] -and $parsed.error.code -eq $ExpectedError) {
            Write-Host ("Bloqueo esperado: " + $ExpectedError) -ForegroundColor Yellow
            return [pscustomobject]@{ expected_error = $true; response = $parsed }
        }
        throw $errorRecord
    }
}
