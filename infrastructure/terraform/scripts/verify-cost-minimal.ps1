param([string]$Profile = 'thangvn', [string]$Region = 'ap-southeast-1')
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$environment = Join-Path $PSScriptRoot '..\environments\cost_minimal'
Push-Location $environment
try { $outputs = terraform output -json | ConvertFrom-Json } finally { Pop-Location }

$targets = @(
  @{ Name='AWS_REAL_SINGAPORE_COLOCATED'; Url=[string]$outputs.singapore_api_endpoint.value; InstanceId=[string]$outputs.singapore_instance_id.value },
  @{ Name='AWS_REAL_HANOI_COLOCATED'; Url=[string]$outputs.hanoi_api_endpoint.value; InstanceId=[string]$outputs.hanoi_instance_id.value },
  @{ Name='AWS_REAL_HYBRID'; Url=[string]$outputs.hybrid_api_endpoint.value; InstanceId=[string]$outputs.singapore_instance_id.value }
)
$instanceIds = @($targets.InstanceId | Select-Object -Unique)
$instances = aws ec2 describe-instances --profile $Profile --region $Region --instance-ids $instanceIds --query 'Reservations[].Instances[].{Id:InstanceId,State:State.Name,AZ:Placement.AvailabilityZone,Type:InstanceType,Credits:CreditSpecification.CpuCredits,ImdsTokens:MetadataOptions.HttpTokens,PublicIp:PublicIpAddress,PrivateIp:PrivateIpAddress}' --output json | ConvertFrom-Json
if (@($instances).Count -ne 2 -or @($instances | Where-Object State -ne 'running').Count -ne 0) { throw 'Both cost-minimal EC2 instances must be running.' }
$hanoi = $instances | Where-Object AZ -eq 'ap-southeast-1-han-1a'
if (-not $hanoi -or $hanoi.Type -ne 'c7i.large') { throw 'Hanoi placement/type verification failed.' }
$singapore = $instances | Where-Object AZ -eq 'ap-southeast-1a'
if (-not $singapore -or $singapore.Type -ne 't3.small' -or $singapore.Credits -ne 'standard') { throw 'Singapore placement/type/CPU-credit verification failed.' }
if (@($instances | Where-Object ImdsTokens -ne 'required').Count -ne 0) { throw 'IMDSv2 enforcement verification failed.' }

$addresses = aws ec2 describe-addresses --profile $Profile --region $Region --filters "Name=instance-id,Values=$($instanceIds -join ',')" --query 'Addresses[].{InstanceId:InstanceId,PublicIp:PublicIp,NetworkBorderGroup:NetworkBorderGroup}' --output json | ConvertFrom-Json
if (@($addresses).Count -ne 2) { throw 'Expected two associated Elastic IPs.' }
$hanoiAddress = $addresses | Where-Object InstanceId -eq $hanoi.Id
$singaporeAddress = $addresses | Where-Object InstanceId -eq $singapore.Id
if ($hanoiAddress.NetworkBorderGroup -ne 'ap-southeast-1-han-1' -or $singaporeAddress.NetworkBorderGroup -ne 'ap-southeast-1') { throw 'Elastic IP network-border-group verification failed.' }

$volumeIds = @($outputs.data_volume_ids.value.PSObject.Properties.Value)
$volumes = aws ec2 describe-volumes --profile $Profile --region $Region --volume-ids $volumeIds --query 'Volumes[].{Id:VolumeId,AZ:AvailabilityZone,Encrypted:Encrypted,Type:VolumeType,Size:Size,State:State}' --output json | ConvertFrom-Json
if (@($volumes | Where-Object { -not $_.Encrypted -or $_.Type -ne 'gp3' -or $_.State -ne 'in-use' }).Count -ne 0) { throw 'Encrypted gp3 data-volume verification failed.' }
if (($volumes | Where-Object Id -eq $outputs.data_volume_ids.value.hanoi).AZ -ne 'ap-southeast-1-han-1a' -or ($volumes | Where-Object Id -eq $outputs.data_volume_ids.value.singapore).AZ -ne 'ap-southeast-1a') { throw 'Data-volume AZ verification failed.' }

$checks = foreach ($target in $targets) {
  $health = Invoke-RestMethod -Uri "$($target.Url)/health" -TimeoutSec 20
  $topology = Invoke-RestMethod -Uri "$($target.Url)/api/topology" -TimeoutSec 20
  $before = Invoke-RestMethod -Uri "$($target.Url)/api/orders" -TimeoutSec 20
  $created = Invoke-RestMethod -Method Post -Uri "$($target.Url)/api/orders" -ContentType 'application/json' -Body (@{customerRef="DEMO-AWS-MIN-$([guid]::NewGuid().ToString('N').Substring(0,10))";items=@(@{sku='VERIFY';quantity=1;unitPrice=1.23})}|ConvertTo-Json -Depth 4) -TimeoutSec 20
  $benchmarks = foreach ($n in @(1,5,10,20)) { Invoke-RestMethod -Uri "$($target.Url)/api/benchmark/db?n=$n" -TimeoutSec 30 }
  $sample = Invoke-RestMethod -Uri "$($target.Url)/api/orders/$($created.order.id)" -TimeoutSec 20
  if ($health.status -ne 'ok' -or $topology.mode -ne 'AWS_REAL' -or $topology.aws.status -ne 'CONNECTED' -or $before.count -lt 1 -or -not $created.order.id -or $sample.order.id -ne $created.order.id) { throw "$($target.Name) verification failed." }
  [ordered]@{name=$target.Name;endpoint=$target.Url;topology=$topology;seedRowCountBefore=$before.count;createdOrderId=$created.order.id;sampleRecord=$sample.order;benchmarkQueryCounts=@($benchmarks.queryCount)}
}

$frontend = Invoke-WebRequest -UseBasicParsing -Uri ([string]$outputs.frontend_url.value) -TimeoutSec 20
if ($frontend.StatusCode -ne 200 -or $frontend.Content -notmatch 'Mini Order Management') { throw 'Singapore S3 frontend verification failed.' }
$document = [ordered]@{status='SUCCEEDED';mode='AWS_REAL';profile='cost_minimal';instances=$instances;elasticIps=$addresses;volumes=$volumes;checks=$checks;frontend=[ordered]@{url=$outputs.frontend_url.value;delivery=$outputs.frontend_delivery_mode.value};verifiedAt=(Get-Date).ToUniversalTime().ToString('o');provenance='Live AWS API, HTTP, and PostgreSQL verification; no emulated samples.'}
$json = $document | ConvertTo-Json -Depth 10
$json | Set-Content -LiteralPath (Join-Path $root 'evidence\aws-cost-minimal-latest.json') -Encoding utf8
$json
