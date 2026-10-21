$ErrorActionPreference='Stop'
Push-Location (Join-Path $PSScriptRoot '../frontend-angular')
try { npm.cmd install; if($LASTEXITCODE -ne 0){throw 'Falló npm install'} } finally { Pop-Location }
