param([string]$BaseUrl='http://127.0.0.1:3000')
& (Join-Path $PSScriptRoot '../v02-gestion-carga/powershell/Ejemplo.ps1') -BaseUrl $BaseUrl
