param([string]$BaseUrl='http://127.0.0.1:3000')
& (Join-Path $PSScriptRoot '../v01-arquitectura-escalable/powershell/Ejemplo.ps1') -BaseUrl $BaseUrl
