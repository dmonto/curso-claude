$ErrorActionPreference='Stop'
Push-Location (Join-Path $PSScriptRoot '../frontend-angular')
try { npm.cmd start } finally { Pop-Location }
