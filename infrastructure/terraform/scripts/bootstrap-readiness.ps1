[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Profile,
  [string]$Region = 'ap-southeast-1'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$environmentRoot = Join-Path $repoRoot 'infrastructure\terraform\environments\cost_minimal'
$evidencePath = Join-Path $repoRoot 'evidence\aws-bootstrap-readiness-latest.json'
$startedAt = (Get-Date).ToUniversalTime().ToString('o')
$checks = [System.Collections.Generic.List[object]]::new()

function Invoke-AwsJson([string[]]$Arguments) {
  $raw = @(& aws @Arguments --profile $Profile --region $Region --output json --no-cli-pager 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "Read-only AWS command failed: aws $($Arguments[0..1] -join ' ')" }
  return (($raw -join "`n") | ConvertFrom-Json)
}

function Test-Api([string]$Name,[string]$Endpoint,[string]$ExpectedScenario) {
  $health = Invoke-RestMethod -Uri "$Endpoint/health" -TimeoutSec 20
  if ($health.status -ne 'ok' -or $health.database -ne 'connected') { throw "$Name health did not prove a connected PostgreSQL database." }
  $topology = Invoke-RestMethod -Uri "$Endpoint/api/topology" -TimeoutSec 20
  if ($topology.mode -ne 'AWS_REAL' -or $topology.scenario -ne $ExpectedScenario) { throw "$Name topology provenance did not match $ExpectedScenario." }
  $checks.Add([ordered]@{ name=$Name; status='READY'; health='ok'; database='connected'; mode='AWS_REAL'; scenario=$ExpectedScenario })
}

try {
  if ($Region -ne 'ap-southeast-1') { throw 'This workflow is restricted to ap-southeast-1.' }
  $identity = Invoke-AwsJson @('sts','get-caller-identity')
  Push-Location $environmentRoot
  try {
    $outputText = (& terraform @('output','-json') 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'terraform output -json failed; no current cost_minimal deployment can be reconciled.' }
    $outputs = $outputText | ConvertFrom-Json
  } finally { Pop-Location }

  $singaporeId = [string]$outputs.singapore_instance_id.value
  $hanoiId = [string]$outputs.hanoi_instance_id.value
  if ($singaporeId -notmatch '^i-[0-9a-f]+$' -or $hanoiId -notmatch '^i-[0-9a-f]+$') { throw 'Terraform outputs did not contain two valid dynamic EC2 instance IDs.' }
  $instances = Invoke-AwsJson @('ec2','describe-instances','--instance-ids',$singaporeId,$hanoiId)
  $instanceRows = @($instances.Reservations | ForEach-Object Instances | Where-Object { $_ })
  if ($instanceRows.Count -ne 2 -or @($instanceRows | Where-Object { $_.State.Name -ne 'running' }).Count -gt 0) { throw 'Both Terraform-discovered EC2 instances must be running.' }
  if (@($instanceRows | Where-Object { $_.InstanceId -eq $hanoiId -and $_.Placement.AvailabilityZone -eq 'ap-southeast-1-han-1a' }).Count -ne 1) { throw 'Hanoi EC2 placement does not match ap-southeast-1-han-1a.' }
  $checks.Add([ordered]@{ name='EC2'; status='READY'; instances=2; hanoiAvailabilityZone='ap-southeast-1-han-1a'; discovery='terraform outputs' })

  $ssm = Invoke-AwsJson @('ssm','describe-instance-information','--filters',"Key=InstanceIds,Values=$singaporeId,$hanoiId")
  $managed = @($ssm.InstanceInformationList | Where-Object { $_.PingStatus -eq 'Online' })
  if ($managed.Count -ne 2) { throw 'Both dynamically discovered EC2 instances must report SSM PingStatus Online.' }
  $checks.Add([ordered]@{ name='SSM'; status='READY'; online=2; repairCommandExecuted=$false })

  $artifact = $outputs.artifact.value
  if ([string]$artifact.region -ne $Region) { throw 'Artifact output is not bound to the Singapore parent Region.' }
  $head = Invoke-AwsJson @('s3api','head-object','--bucket',[string]$artifact.bucket,'--key',[string]$artifact.key)
  if ([string]$head.Metadata.sha256 -ne [string]$artifact.sha256) { throw 'S3 artifact SHA-256 metadata differs from the reviewed Terraform artifact hash.' }
  $checks.Add([ordered]@{ name='Artifact'; status='READY'; parentRegion=$Region; key=[string]$artifact.key; sha256=[string]$artifact.sha256 })

  $secretArns = $outputs.database_secret_arns.value
  foreach ($location in @('hanoi','singapore')) {
    $versions = Invoke-AwsJson @('secretsmanager','list-secret-version-ids','--secret-id',[string]$secretArns.$location)
    $current = @($versions.Versions | Where-Object { $_.VersionStages -contains 'AWSCURRENT' })
    if ($current.Count -lt 1) { throw "$location PostgreSQL secret has no AWSCURRENT version; native user-data initialization is incomplete." }
  }
  $checks.Add([ordered]@{ name='PostgreSQL secrets'; status='READY'; hanoiCurrent=$true; singaporeCurrent=$true; valuesExposed=$false })

  # Hanoi database readiness is intentionally proven before the Singapore Hybrid API dependency.
  Test-Api 'Hanoi API + Hanoi PostgreSQL' ([string]$outputs.hanoi_api_endpoint.value) 'aws-real-hanoi-colocated'
  Test-Api 'Singapore API + Singapore PostgreSQL' ([string]$outputs.singapore_api_endpoint.value) 'aws-real-singapore-colocated'
  Test-Api 'Singapore Hybrid API + Hanoi PostgreSQL' ([string]$outputs.hybrid_api_endpoint.value) 'aws-real-hybrid'

  $document = [ordered]@{
    schemaVersion=1; status='SUCCEEDED'; operation='READ_ONLY_BOOTSTRAP_READINESS'; startedAt=$startedAt
    completedAt=(Get-Date).ToUniversalTime().ToString('o'); deploymentIdentity='hanoi-lz-live-demo/cost_minimal'
    accountSuffix=([string]$identity.Account).Substring(([string]$identity.Account).Length-4); profile=$Profile; region=$Region
    checks=$checks; mutationPerformed=$false
    validation='Native user-data, artifact integrity, both SSM agents, both database secrets, Hanoi API, Singapore API and Hybrid API are ready.'
  }
  $document | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $evidencePath -Encoding utf8
  $document | ConvertTo-Json -Depth 10
} catch {
  $document = [ordered]@{
    schemaVersion=1; status='FAILED'; operation='READ_ONLY_BOOTSTRAP_READINESS'; startedAt=$startedAt
    completedAt=(Get-Date).ToUniversalTime().ToString('o'); deploymentIdentity='hanoi-lz-live-demo/cost_minimal'
    profile=$Profile; region=$Region; checks=$checks; mutationPerformed=$false; error=$_.Exception.Message
  }
  $document | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $evidencePath -Encoding utf8
  throw
}
