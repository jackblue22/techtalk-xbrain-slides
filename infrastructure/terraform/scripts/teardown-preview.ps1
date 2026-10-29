param(
  [Parameter(Mandatory)][ValidateSet('CostMinimal')][string]$Environment,
  [string]$PresenterCidr = '14.224.239.90/32',
  [string]$Profile = 'thangvn',
  [string]$Region = 'ap-southeast-1',
  [string]$ExpectedAccountSuffix = '7667',
  [string[]]$KnownSecretArn = @(),
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'
$projectTag = 'hanoi-lz-live-demo'
$environmentTag = 'cost_minimal'
$terraformRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$repositoryRoot = (Resolve-Path (Join-Path $terraformRoot '..\..')).Path
$directory = Join-Path $terraformRoot 'environments\cost_minimal'

function Invoke-AwsJson {
  param([Parameter(Mandatory)][string[]]$Arguments)
  $raw = & aws @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw "AWS read-only command failed: aws $($Arguments -join ' ')`n$raw" }
  if ([string]::IsNullOrWhiteSpace(($raw -join ''))) { return $null }
  return (($raw -join "`n") | ConvertFrom-Json)
}

function Get-TagValue {
  param($Tags, [string]$Key)
  return @($Tags | Where-Object Key -eq $Key | Select-Object -ExpandProperty Value -First 1)[0]
}

function Assert-ProjectTags {
  param([string]$Kind, [string]$Id, $Tags)
  $project = Get-TagValue $Tags 'Project'
  $environment = Get-TagValue $Tags 'Environment'
  if ($project -ne $projectTag -or $environment -ne $environmentTag) {
    throw "Scope violation: $Kind $Id is not tagged Project=$projectTag and Environment=$environmentTag."
  }
}

function Get-Gp3MonthlyRate {
  param([string]$AvailabilityZone)
  if ($AvailabilityZone -like 'ap-southeast-1-han-*') { return [decimal]0.1344 }
  return [decimal]0.096
}

function Get-SnapshotMonthlyRate {
  param([string]$AvailabilityZone)
  if ($AvailabilityZone -like 'ap-southeast-1-han-*') { return [decimal]0.07 }
  return [decimal]0.05
}

$identity = Invoke-AwsJson @('sts', 'get-caller-identity', '--profile', $Profile, '--output', 'json')
$accountId = [string]$identity.Account
if ([string]::IsNullOrWhiteSpace($accountId)) { throw "AWS profile $Profile did not return an account ID." }
if (-not $accountId.EndsWith($ExpectedAccountSuffix)) { throw "AWS account does not end in the reviewed suffix $ExpectedAccountSuffix." }

$env:TF_VAR_expected_account_id = $accountId
$env:TF_VAR_benchmark_client_cidrs = ConvertTo-Json -Compress @($PresenterCidr)

$stateAddresses = @()
$destroyPreviewOutput = @()
$destroyPreviewExitCode = 0
Push-Location -LiteralPath $directory
try {
  $savedErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $stateOutput = @(& terraform state list 2>&1)
    if ($LASTEXITCODE -eq 0) { $stateAddresses = @($stateOutput | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }) }

    # Read-only against AWS. No -out is used, so no destroy plan can later be applied accidentally.
    $destroyPreviewOutput = @(& terraform plan -destroy -refresh=true -input=false -lock=false -no-color 2>&1)
    $destroyPreviewExitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $savedErrorActionPreference
  }
  if ($destroyPreviewExitCode -notin @(0, 1, 2)) { throw "Unexpected Terraform exit code $destroyPreviewExitCode." }
} finally {
  Pop-Location
}

$tagged = Invoke-AwsJson @(
  'resourcegroupstaggingapi', 'get-resources', '--profile', $Profile, '--region', $Region,
  '--tag-filters', "Key=Project,Values=$projectTag", "Key=Environment,Values=$environmentTag", '--output', 'json'
)
$taggedResources = @($tagged.ResourceTagMappingList | Where-Object { $null -ne $_ })

$instancesResponse = Invoke-AwsJson @(
  'ec2', 'describe-instances', '--profile', $Profile, '--region', $Region,
  '--filters', "Name=tag:Project,Values=$projectTag", "Name=tag:Environment,Values=$environmentTag",
  'Name=instance-state-name,Values=pending,running,stopping,stopped,shutting-down', '--output', 'json'
)
$instances = @($instancesResponse.Reservations | ForEach-Object { $_.Instances } | Where-Object { $null -ne $_ })
foreach ($item in $instances) { Assert-ProjectTags 'EC2 instance' $item.InstanceId $item.Tags }

$volumesResponse = Invoke-AwsJson @(
  'ec2', 'describe-volumes', '--profile', $Profile, '--region', $Region,
  '--filters', "Name=tag:Project,Values=$projectTag", "Name=tag:Environment,Values=$environmentTag", '--output', 'json'
)
$volumes = @($volumesResponse.Volumes | Where-Object { $null -ne $_ })
foreach ($item in $volumes) { Assert-ProjectTags 'EBS volume' $item.VolumeId $item.Tags }

$addressesResponse = Invoke-AwsJson @(
  'ec2', 'describe-addresses', '--profile', $Profile, '--region', $Region,
  '--filters', "Name=tag:Project,Values=$projectTag", "Name=tag:Environment,Values=$environmentTag", '--output', 'json'
)
$addresses = @($addressesResponse.Addresses | Where-Object { $null -ne $_ })
foreach ($item in $addresses) { Assert-ProjectTags 'Elastic IP' $item.AllocationId $item.Tags }

$snapshotsResponse = Invoke-AwsJson @(
  'ec2', 'describe-snapshots', '--profile', $Profile, '--region', $Region, '--owner-ids', 'self',
  '--filters', "Name=tag:Project,Values=$projectTag", "Name=tag:Environment,Values=$environmentTag", '--output', 'json'
)
$snapshots = @($snapshotsResponse.Snapshots | Where-Object { $null -ne $_ })
foreach ($item in $snapshots) { Assert-ProjectTags 'EBS snapshot' $item.SnapshotId $item.Tags }

$bucketArns = @($taggedResources.ResourceARN | Where-Object { $_ -like 'arn:aws:s3:::*' })
$buckets = @()
foreach ($arn in $bucketArns) {
  $name = $arn.Substring('arn:aws:s3:::'.Length)
  $tagsResponse = Invoke-AwsJson @('s3api', 'get-bucket-tagging', '--profile', $Profile, '--bucket', $name, '--output', 'json')
  Assert-ProjectTags 'S3 bucket' $name $tagsResponse.TagSet
  $versions = Invoke-AwsJson @('s3api', 'list-object-versions', '--profile', $Profile, '--bucket', $name, '--output', 'json')
  $versionItems = @($versions.Versions | Where-Object { $null -ne $_ })
  $deleteMarkers = @($versions.DeleteMarkers | Where-Object { $null -ne $_ })
  $bytes = [decimal](($versionItems | Measure-Object -Property Size -Sum).Sum)
  $buckets += [pscustomobject]@{
    name = $name
    arn = $arn
    versions = $versionItems.Count
    deleteMarkers = $deleteMarkers.Count
    bytesAcrossVersions = $bytes
    estimatedMonthlyStorageUsd = [math]::Round(($bytes / 1GB) * [decimal]0.025, 8)
  }
}

$secretArns = @(@($taggedResources.ResourceARN | Where-Object { $_ -like 'arn:aws:secretsmanager:*:secret:*' }) + $KnownSecretArn | Sort-Object -Unique)
$secrets = @()
foreach ($arn in $secretArns) {
  $secret = Invoke-AwsJson @('secretsmanager', 'describe-secret', '--profile', $Profile, '--region', $Region, '--secret-id', $arn, '--output', 'json')
  Assert-ProjectTags 'Secrets Manager secret' $arn $secret.Tags
  $pendingDeletion = $null -ne $secret.DeletedDate
  $secrets += [pscustomobject]@{
    arn = $arn
    name = $secret.Name
    pendingDeletion = $pendingDeletion
    deletedDate = $secret.DeletedDate
    estimatedMonthlyStorageUsd = if ($pendingDeletion) { [decimal]0 } else { [decimal]0.40 }
  }
}

$computeHourly = [decimal]0
$instanceReport = foreach ($item in $instances) {
  $rate = switch ($item.InstanceType) {
    'c7i.large' { [decimal]0.1029 }
    't3.small' { [decimal]0.0264 }
    default { [decimal]0 }
  }
  $billableCompute = $item.State.Name -in @('pending', 'running')
  if ($billableCompute) { $computeHourly += $rate }
  [pscustomobject]@{
    id = $item.InstanceId
    state = $item.State.Name
    type = $item.InstanceType
    availabilityZone = $item.Placement.AvailabilityZone
    estimatedComputeHourlyUsd = if ($billableCompute) { $rate } else { [decimal]0 }
  }
}

$ebsMonthly = [decimal]0
$volumeReport = foreach ($item in $volumes) {
  $rate = Get-Gp3MonthlyRate $item.AvailabilityZone
  $monthly = [decimal]$item.Size * $rate
  $ebsMonthly += $monthly
  [pscustomobject]@{
    id = $item.VolumeId
    state = $item.State
    availabilityZone = $item.AvailabilityZone
    sizeGiB = $item.Size
    encrypted = $item.Encrypted
    attachmentInstanceIds = @($item.Attachments.InstanceId)
    estimatedMonthlyUsd = [math]::Round($monthly, 6)
  }
}

$snapshotMonthly = [decimal]0
$snapshotReport = foreach ($item in $snapshots) {
  $sourceVolume = @($volumes | Where-Object VolumeId -eq $item.VolumeId | Select-Object -First 1)
  $az = if ($sourceVolume.Count) { $sourceVolume[0].AvailabilityZone } else { 'unknown' }
  $rate = Get-SnapshotMonthlyRate $az
  $monthly = [decimal]$item.VolumeSize * $rate
  $snapshotMonthly += $monthly
  [pscustomobject]@{
    id = $item.SnapshotId
    sourceVolumeId = $item.VolumeId
    sizeGiB = $item.VolumeSize
    state = $item.State
    estimatedMonthlyUsd = [math]::Round($monthly, 6)
    pricingNote = if ($az -eq 'unknown') { 'Regional/Local Zone source is unknown; verify the billing SKU.' } else { "Estimated from source AZ $az." }
  }
}

$eipHourly = [decimal]$addresses.Count * [decimal]0.005
$secretMonthly = [decimal](($secrets | Measure-Object -Property estimatedMonthlyStorageUsd -Sum).Sum)
$s3Monthly = [decimal](($buckets | Measure-Object -Property estimatedMonthlyStorageUsd -Sum).Sum)
$monthlyNonCompute = $ebsMonthly + $snapshotMonthly + $secretMonthly + $s3Monthly
$currentHourlyEquivalent = $computeHourly + $eipHourly + ($monthlyNonCompute / [decimal]730)
$afterStopHourlyEquivalent = $eipHourly + ($monthlyNonCompute / [decimal]730)

$blockers = @(
  [pscustomobject]@{ blocker = 'EBS prevent_destroy'; affected = @('module.hanoi.aws_ebs_volume.data', 'module.singapore.aws_ebs_volume.data'); resolution = 'Requires a separately reviewed source change and data disposition approval before a destroy plan can succeed.' },
  [pscustomobject]@{ blocker = 'S3 force_destroy=false'; affected = @('module.artifacts.aws_s3_bucket.this', 'module.frontend.aws_s3_bucket.this'); resolution = 'Every object must be explicitly inventoried and deleted within the verified bucket scope before bucket deletion.' },
  [pscustomobject]@{ blocker = 'Versioned artifact bucket'; affected = @('module.artifacts.aws_s3_bucket.this'); resolution = 'Delete all versions and delete markers, not only current keys, after separate destructive approval.' }
)

$report = [ordered]@{
  generatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  mode = 'READ_ONLY_TEARDOWN_PREVIEW'
  mutatingOperationsExecuted = $false
  scope = [ordered]@{ profile = $Profile; accountSuffix = $accountId.Substring($accountId.Length - 4); region = $Region; projectTag = $projectTag; environmentTag = $environmentTag }
  terraform = [ordered]@{
    stateResourceCount = $stateAddresses.Count
    stateAddresses = $stateAddresses
    destroyPreviewExitCode = $destroyPreviewExitCode
    destroyPreviewBlocked = $destroyPreviewExitCode -eq 1
    destroyPreviewSummary = @($destroyPreviewOutput | Select-String 'Plan:|prevent_destroy|Error:' | ForEach-Object { $_.Line.Trim() })
  }
  inventory = [ordered]@{
    taggedResourceArns = @($taggedResources.ResourceARN)
    instances = @($instanceReport)
    elasticIps = @($addresses | ForEach-Object { [pscustomobject]@{ allocationId = $_.AllocationId; publicIp = $_.PublicIp; instanceId = $_.InstanceId; networkBorderGroup = $_.NetworkBorderGroup } })
    volumes = @($volumeReport)
    snapshots = @($snapshotReport)
    buckets = @($buckets)
    secrets = @($secrets)
  }
  destroyBlockers = $blockers
  residualCostEstimate = [ordered]@{
    currentComputeHourlyUsd = [math]::Round($computeHourly, 6)
    allocatedElasticIpHourlyUsd = [math]::Round($eipHourly, 6)
    ebsMonthlyUsd = [math]::Round($ebsMonthly, 6)
    snapshotMonthlyUsd = [math]::Round($snapshotMonthly, 6)
    activeSecretMonthlyUsd = [math]::Round($secretMonthly, 6)
    s3StorageMonthlyUsd = [math]::Round($s3Monthly, 8)
    currentHourlyEquivalentUsd = [math]::Round($currentHourlyEquivalent, 8)
    afterComputeStopHourlyEquivalentUsd = [math]::Round($afterStopHourlyEquivalent, 8)
    caveats = @('Data transfer, requests, taxes, and partial-month billing are excluded.', 'Secrets pending deletion are counted at zero storage charge.', 'Snapshot estimates require billing confirmation when source placement is unknown.')
  }
  requiredPostCleanupAssertions = @(
    'No project-tagged EC2 instance is pending, running, stopping, stopped, or shutting-down.',
    'No project-tagged Elastic IP allocation remains.',
    'No project-tagged EBS volume remains unless its exact retained ID, owner, expiry, and cost were approved.',
    'Both verified S3 buckets have zero versions and zero delete markers before bucket deletion, then no bucket ARN remains.',
    'No project-tagged EBS snapshot remains unless explicitly approved.',
    'Secrets are absent or pending deletion; pending-deletion secrets are reported but estimated at zero storage charge.',
    'Terraform state contains no resource that AWS has deleted and no state entry was removed merely to hide a retained resource.'
  )
}

$json = $report | ConvertTo-Json -Depth 20
if ($OutputPath) {
  $resolvedParent = (Resolve-Path (Split-Path -Parent $OutputPath)).Path
  if (-not $resolvedParent.StartsWith($repositoryRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'OutputPath must be inside the repository.'
  }
  [System.IO.File]::WriteAllText((Join-Path $resolvedParent (Split-Path -Leaf $OutputPath)), $json + [Environment]::NewLine, [System.Text.UTF8Encoding]::new($false))
}
$json

if ($destroyPreviewExitCode -eq 1) {
  Write-Warning 'Terraform destroy preview is blocked or invalid. Review terraform.destroyPreviewSummary and the retained-data safeguards; no mutation was attempted.'
}
