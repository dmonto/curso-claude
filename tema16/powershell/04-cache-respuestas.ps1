param([string]$BaseUrl='http://127.0.0.1:3000')
& (Join-Path $PSScriptRoot '../v04-cache-respuestas/powershell/Ejemplo.ps1') -BaseUrl $BaseUrl
