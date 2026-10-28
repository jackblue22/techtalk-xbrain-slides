param([string]$Profile = 'thangvn')
$ErrorActionPreference = 'Stop'
$region = 'ap-southeast-1'
$project = 'hanoi-lz-live-demo'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$evidencePath = Join-Path $root 'evidence\live-demo-preflight.json'
$planPath = Join-Path $root 'infrastructure\terraform\environments\cost_minimal\phase2b2-cost_minimal.tfplan'
$checks = New-Object System.Collections.Generic.List[object]

function Add-Check([string]$Name, [string]$State, [string]$Detail) {
  $checks.Add([ordered]@{ name=$Name; state=$State; detail=$Detail })
}

$authentication = 'BLOCKED_BY_AUTH'
$oldPreference = $ErrorActionPreference
$ErrorActionPreference = 'SilentlyContinue'
$null = & aws sts get-caller-identity --profile $Profile --output json 2>&1
$identityExit = $LASTEXITCODE
$ErrorActionPreference = $oldPreference
if ($identityExit -eq 0) {
  $authentication = 'AUTHENTICATED'
  Add-Check 'AWS SSO / credentials' 'READY' "Profile $Profile authenticated; identity is redacted."
} else {
  Add-Check 'AWS SSO / credentials' 'NOT_READY' "Profile $Profile is not authenticated. Do not infer account or Local Zone ineligibility."
}

$presenterIp = $null
try {
  $presenterIp = (Invoke-RestMethod -Uri 'https://checkip.amazonaws.com' -TimeoutSec 10).Trim()
  if ($presenterIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw 'Invalid IPv4 response.' }
} catch {
  Add-Check 'Presenter public IPv4' 'NOT_READY' 'Could not determine the current public IPv4 address.'
}

$plannedCidrs = @()
$planHash = $null
if (Test-Path -LiteralPath $planPath) {
  $planHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $planPath).Hash.ToLowerInvariant()
  Push-Location (Split-Path -Parent $planPath)
  try {
    $planJson = (& terraform show -json (Split-Path -Leaf $planPath) | Out-String | ConvertFrom-Json)
    $plannedCidrs = @($planJson.resource_changes | Where-Object { $_.type -eq 'aws_vpc_security_group_ingress_rule' -and $_.name -eq 'api' } | ForEach-Object { $_.change.after.cidr_ipv4 } | Where-Object { $_ })
  } finally { Pop-Location }
}
if ($presenterIp) {
  $currentCidr = "$presenterIp/32"
  if ($plannedCidrs -contains $currentCidr) { Add-Check 'Presenter IP allowlist' 'READY' "Current IPv4 matches saved plan allowlist $currentCidr." }
  elseif ($plannedCidrs.Count -gt 0) { Add-Check 'Presenter IP allowlist' 'NOT_READY' "Current IPv4 $currentCidr does not match the saved plan. Regenerate and review the plan; do not apply the stale plan." }
  else { Add-Check 'Presenter IP allowlist' 'NOT_READY' 'No reviewed presenter CIDR was found in the saved plan.' }
}

$instances = @()
$volumes = @()
if ($authentication -eq 'AUTHENTICATED') {
  $instanceJson = & aws ec2 describe-instances --profile $Profile --region $region --filters "Name=tag:Project,Values=$project" "Name=instance-state-name,Values=pending,running,stopping,stopped" --output json | ConvertFrom-Json
  $instances = @($instanceJson.Reservations | ForEach-Object { $_.Instances } | Where-Object { $_ } | ForEach-Object { [ordered]@{ instanceId=$_.InstanceId; state=$_.State.Name; instanceType=$_.InstanceType; availabilityZone=$_.Placement.AvailabilityZone; name=($_.Tags | Where-Object Key -eq 'Name' | Select-Object -First 1).Value } })
  $volumeJson = & aws ec2 describe-volumes --profile $Profile --region $region --filters "Name=tag:Project,Values=$project" --output json | ConvertFrom-Json
  $volumes = @($volumeJson.Volumes | ForEach-Object { [ordered]@{ volumeId=$_.VolumeId; state=$_.State; availabilityZone=$_.AvailabilityZone; encrypted=$_.Encrypted; sizeGiB=$_.Size } })
  if ($instances.Count -eq 0) { Add-Check 'AWS lab inventory' 'NOT_READY' 'No tagged Singapore/Hanoi EC2 instances are deployed.' }
  elseif (@($instances | Where-Object state -eq 'running').Count -eq 2) { Add-Check 'AWS lab inventory' 'READY' 'Both tagged lab instances are running.' }
  else { Add-Check 'AWS lab inventory' 'NOT_READY' "Discovered $($instances.Count) tagged instance(s), but both are not running." }
  $hanoi = @($instances | Where-Object availabilityZone -eq 'ap-southeast-1-han-1a')
  Add-Check 'Hanoi placement' $(if($hanoi.Count -eq 1){'READY'}else{'NOT_READY'}) $(if($hanoi.Count -eq 1){'One tagged instance is placed in ap-southeast-1-han-1a.'}else{'A single tagged Hanoi instance in ap-southeast-1-han-1a was not found.'})
}

$composeServices = @()
try {
  $composeArgs = @('compose','-f',(Join-Path $root 'docker-compose.yml'),'-f',(Join-Path $root 'docker-compose.emulation.yml'),'ps','--format','json')
  $composeLines = @(& docker @composeArgs 2>$null)
  foreach ($line in $composeLines) { if ($line) { $item = $line | ConvertFrom-Json; $composeServices += [ordered]@{service=$item.Service;state=$item.State;health=$item.Health} } }
  $required = @('db','backend','frontend','dashboard','toxiproxy','sg-db','han-db','recovery-db','sg-api','han-api','hybrid-api')
  $running = @($composeServices | Where-Object { $_.state -eq 'running' }).service
  $missing = @($required | Where-Object { $_ -notin $running })
  Add-Check 'Local containers' $(if($missing.Count -eq 0){'READY'}else{'NOT_READY'}) $(if($missing.Count -eq 0){'All required local services are running.'}else{"Missing or stopped: $($missing -join ', ')."})
} catch { Add-Check 'Local containers' 'NOT_READY' 'Docker Compose status could not be read.' }

$apiEvidencePath = Join-Path $root 'evidence\aws-cost-minimal-latest.json'
$apiChecks = @()
if (Test-Path -LiteralPath $apiEvidencePath) {
  try {
    $verified = Get-Content -Raw -LiteralPath $apiEvidencePath | ConvertFrom-Json
    foreach ($item in @($verified.checks)) {
      if (-not $item.endpoint) { continue }
      try {
        $health = Invoke-RestMethod -Uri ($item.endpoint.TrimEnd('/') + '/health') -TimeoutSec 15
        $apiChecks += [ordered]@{name=$item.name;endpoint=$item.endpoint;state=if($health.status -eq 'ok' -and $health.database -eq 'connected'){'READY'}else{'NOT_READY'};database=$health.database}
      } catch { $apiChecks += [ordered]@{name=$item.name;endpoint=$item.endpoint;state='NOT_READY';database='UNREACHABLE'} }
    }
  } catch { }
}
if ($apiChecks.Count -eq 0) { Add-Check 'AWS API and database health' 'NOT_READY' 'No successful deployed endpoint evidence is available.' }
elseif (@($apiChecks | Where-Object state -ne 'READY').Count -eq 0) { Add-Check 'AWS API and database health' 'READY' 'Every discovered AWS endpoint returned database-connected health.' }
else { Add-Check 'AWS API and database health' 'NOT_READY' 'One or more AWS endpoints failed health or database connectivity.' }

$awsReady = @($checks | Where-Object { $_.name -ne 'Local containers' -and $_.state -ne 'READY' }).Count -eq 0
$localReady = @($checks | Where-Object { $_.name -eq 'Local containers' -and $_.state -eq 'READY' }).Count -eq 1
$document = [ordered]@{
  status='SUCCEEDED'; operation='READ_ONLY_DEMO_PREFLIGHT'; checkedAt=(Get-Date).ToUniversalTime().ToString('o'); profile=$Profile; region=$region
  authentication=$authentication; presenterCidr=if($presenterIp){"$presenterIp/32"}else{$null}; plannedCidrs=$plannedCidrs; savedPlanSha256=$planHash
  localDemoState=if($localReady){'READY'}else{'NOT_READY'}; awsRealState=if($awsReady){'READY'}else{'NOT_READY'}
  checks=$checks; instances=$instances; volumes=$volumes; apiChecks=$apiChecks; composeServices=$composeServices
  safeguards=@('No AWS resource was created, started, stopped, changed, or deleted.','No credential or full account identity is included.','NOT_READY does not imply account ineligibility.')
}
$document | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $evidencePath -Encoding utf8
$document | ConvertTo-Json -Depth 8
