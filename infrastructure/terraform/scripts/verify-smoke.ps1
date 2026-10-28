param([string]$Profile = 'thangvn', [string]$Region = 'ap-southeast-1')
$ErrorActionPreference = 'Stop'
$environment = Join-Path $PSScriptRoot '..\environments\smoke'
Push-Location $environment
try { $outputs = terraform output -json | ConvertFrom-Json } finally { Pop-Location }
$instanceId = [string]$outputs.instance_id.value
$volumeId = [string]$outputs.data_volume_id.value
if ($instanceId -notmatch '^i-[0-9a-f]+$' -or $volumeId -notmatch '^vol-[0-9a-f]+$') { throw 'Terraform smoke outputs are absent or invalid.' }

$instance = (& aws ec2 describe-instances --profile $Profile --region $Region --instance-ids $instanceId --query 'Reservations[0].Instances[0].{State:State.Name,AZ:Placement.AvailabilityZone,Type:InstanceType,PublicIp:PublicIpAddress,Subnet:SubnetId}' --output json | ConvertFrom-Json)
$volume = (& aws ec2 describe-volumes --profile $Profile --region $Region --volume-ids $volumeId --query 'Volumes[0].{State:State,AZ:AvailabilityZone,Encrypted:Encrypted,Type:VolumeType,Size:Size}' --output json | ConvertFrom-Json)
if ($instance.State -ne 'running' -or $instance.AZ -ne 'ap-southeast-1-han-1a') { throw 'Smoke EC2 is not running in the Hanoi Local Zone.' }
if ($volume.State -notin @('in-use','available') -or $volume.AZ -ne $instance.AZ -or -not $volume.Encrypted -or $volume.Type -ne 'gp3') { throw 'Smoke EBS placement or encryption verification failed.' }

$command = & aws ssm send-command --profile $Profile --region $Region --instance-ids $instanceId --document-name AWS-RunShellScript --parameters 'commands=["curl -fsS http://127.0.0.1:8080/health","test -f /mnt/hanoi-smoke/bootstrap-verified-at.txt"]' --query 'Command.CommandId' --output text
if ($LASTEXITCODE -ne 0 -or $command -notmatch '^[0-9a-f-]+$') { throw 'SSM smoke command could not be started.' }
& aws ssm wait command-executed --profile $Profile --region $Region --command-id $command --instance-id $instanceId
$result = (& aws ssm get-command-invocation --profile $Profile --region $Region --command-id $command --instance-id $instanceId --query '{Status:Status,Output:StandardOutputContent,Error:StandardErrorContent}' --output json | ConvertFrom-Json)
if ($result.Status -ne 'Success') { throw "SSM smoke verification failed: $($result.Error)" }
[ordered]@{status='SUCCEEDED';instanceId=$instanceId;instance=$instance;volumeId=$volumeId;volume=$volume;workloadOutput=$result.Output} | ConvertTo-Json -Depth 6

