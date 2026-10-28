param([string]$Profile = 'thangvn', [string]$Region = 'ap-southeast-1')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$environment = Join-Path $PSScriptRoot '..\environments\full'
Push-Location $environment
try { $outputs = terraform output -json | ConvertFrom-Json } finally { Pop-Location }
$sgUrl = [string]$outputs.singapore_endpoint.value
$hanUrl = [string]$outputs.hanoi_endpoint.value
$ids = @([string]$outputs.singapore_app_instance_id.value,[string]$outputs.hanoi_app_instance_id.value,[string]$outputs.hanoi_database_instance_id.value)
$instances = (& aws ec2 describe-instances --profile $Profile --region $Region --instance-ids $ids --query 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,AZ:Placement.AvailabilityZone,Type:InstanceType,PublicIp:PublicIpAddress}' --output json | ConvertFrom-Json)
if (@($instances | Where-Object PublicIp).Count -ne 0) { throw 'A full-lab EC2 instance unexpectedly has a public IP.' }
if (@($instances | Where-Object State -ne 'running').Count -ne 0) { throw 'One or more full-lab EC2 instances are not running.' }

$rdsId = [string]$outputs.rds_identifier.value
$rds = (& aws rds describe-db-instances --profile $Profile --region $Region --db-instance-identifier $rdsId --query 'DBInstances[0].{Status:DBInstanceStatus,Public:PubliclyAccessible,AZ:AvailabilityZone,Encrypted:StorageEncrypted,Engine:Engine,Version:EngineVersion}' --output json | ConvertFrom-Json)
if ($rds.Status -ne 'available' -or $rds.Public -or -not $rds.Encrypted) { throw 'RDS availability, public-access, or encryption verification failed.' }

$checks = @()
foreach ($target in @(@{Name='AWS_REAL_SINGAPORE';Url=$sgUrl},@{Name='AWS_REAL_HANOI';Url=$hanUrl})) {
  $health = Invoke-RestMethod -Uri "$($target.Url)/health" -TimeoutSec 20
  $topology = Invoke-RestMethod -Uri "$($target.Url)/api/topology" -TimeoutSec 20
  $orders = Invoke-RestMethod -Uri "$($target.Url)/api/orders" -TimeoutSec 20
  $created = Invoke-RestMethod -Method Post -Uri "$($target.Url)/api/orders" -ContentType 'application/json' -Body (@{customerRef="DEMO-AWS-VERIFY-$([guid]::NewGuid().ToString('N').Substring(0,10))";items=@(@{sku='VERIFY';quantity=1;unitPrice=1.23})}|ConvertTo-Json -Depth 4) -TimeoutSec 20
  $benchmarks = foreach ($n in @(1,5,10,20)) { Invoke-RestMethod -Uri "$($target.Url)/api/benchmark/db?n=$n" -TimeoutSec 30 }
  if ($health.status -ne 'ok' -or $topology.mode -ne 'AWS_REAL' -or $topology.aws.status -ne 'CONNECTED' -or $orders.count -lt 1 -or -not $created.order.id) { throw "$($target.Name) API/DB verification failed." }
  $checks += [ordered]@{name=$target.Name;endpoint=$target.Url;health=$health.status;topology=$topology;orderCountBeforeWrite=$orders.count;createdOrderId=$created.order.id;benchmarkQueryCounts=@($benchmarks.queryCount)}
}
$document = [ordered]@{status='SUCCEEDED';mode='AWS_REAL';instances=$instances;rds=$rds;checks=$checks;verifiedAt=(Get-Date).ToUniversalTime().ToString('o');provenance='Live AWS API and HTTP verification; no emulated samples included.'}
$json = $document | ConvertTo-Json -Depth 10
$json | Set-Content -LiteralPath (Join-Path $root 'evidence\aws-deployment-latest.json') -Encoding utf8
$json
