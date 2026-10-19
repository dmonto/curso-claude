param([string]$BaseUrl='http://127.0.0.1:3000')
$ErrorActionPreference='Stop'
function Invoke-Lab {
  param([string]$Path,[string]$Token='',[string]$Method='GET',$Body=$null)
  $headers=@{}
  if ($Token) { $headers.Authorization="Bearer $Token" }
  $args=@{Uri="$BaseUrl$Path";Method=$Method;Headers=$headers}
  if ($null -ne $Body) { $args.ContentType='application/json'; $args.Body=$Body | ConvertTo-Json -Depth 10 -Compress }
  Invoke-RestMethod @args
}
function Get-LabToken {
  param([string]$Email='admin@empresa.com',[string]$Password='Password123!')
  (Invoke-Lab -Path '/auth/login' -Method POST -Body @{email=$Email;password=$Password}).accessToken
}
function Assert-Status {
  param([scriptblock]$Call,[int]$Expected)
  try { $null=& $Call; throw "Se esperaba HTTP $Expected" }
  catch {
    if (!$_.Exception.Response) { throw }
    $actual=[int]$_.Exception.Response.StatusCode
    if ($actual -ne $Expected) { throw "HTTP $actual; esperado $Expected" }
    @{expected=$Expected;actual=$actual;ok=$true} | ConvertTo-Json
  }
}
