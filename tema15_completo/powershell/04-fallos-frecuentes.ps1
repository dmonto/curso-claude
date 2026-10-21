param([string]$BaseUrl='http://127.0.0.1:3000')
. (Join-Path $PSScriptRoot 'common.ps1')
try { $r=Send-Demo -BaseUrl $BaseUrl -Simulate tool_error } catch { @{expected_error=$_.Exception.Message} | ConvertTo-Json -Depth 10 | Write-Host }
$null=Invoke-Lab -BaseUrl $BaseUrl -Path '/analysis/failures'
