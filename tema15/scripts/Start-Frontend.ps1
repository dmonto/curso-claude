$ErrorActionPreference='Stop'
Push-Location (Join-Path (Split-Path $PSScriptRoot -Parent) 'frontend-angular')
try { npm.cmd start } finally { Pop-Location }
