param([ValidateRange(1,10)][int]$Version = 10, [string]$BaseUrl = "http://localhost:3000", [ValidateSet("user-002","user-003")][string]$DemoUser = "user-002")
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$versions = Get-Content (Join-Path $root "versions.json") -Raw | ConvertFrom-Json
$versionInfo = $versions | Where-Object { $_.stage -eq $Version }
$demo = Join-Path (Join-Path $root $versionInfo.directory) "powershell/Test-Demo.ps1"
& $demo -BaseUrl $BaseUrl -DemoUser $DemoUser
