$ErrorActionPreference='Stop'
function Invoke-Lab {
 param([string]$Path,[string]$Method='GET',[hashtable]$Body=@{},[string]$BaseUrl='http://127.0.0.1:3000')
 $params=@{Uri="$BaseUrl$Path";Method=$Method;TimeoutSec=600}
 if($Method -eq 'POST') { $json=$Body | ConvertTo-Json -Depth 30; $params.ContentType='application/json; charset=utf-8'; $params.Body=[Text.Encoding]::UTF8.GetBytes($json) }
 $result=Invoke-RestMethod @params
 $result | ConvertTo-Json -Depth 40 | Write-Host
 return $result
}
function Send-Demo {
 param([string]$BaseUrl='http://127.0.0.1:3000',[string]$Task='order_status',[string]$Entity='12345',[string]$Simulate='')
 $b=@{session_id=[guid]::NewGuid().ToString();task_type=$Task;entity_id=$Entity;message='Explica el estado y los datos disponibles'}
 if($Simulate) { $b.simulate=$Simulate }
 return Invoke-Lab -BaseUrl $BaseUrl -Path '/api/assistant/message' -Method POST -Body $b
}
