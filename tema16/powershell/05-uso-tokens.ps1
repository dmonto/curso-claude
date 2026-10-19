param([string]$BaseUrl='http://127.0.0.1:3000')
& (Join-Path $PSScriptRoot '../v05-uso-tokens/powershell/Ejemplo.ps1') -BaseUrl $BaseUrl
