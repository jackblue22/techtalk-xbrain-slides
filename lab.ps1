[CmdletBinding()]
param(
  [Parameter(Position=0)][ValidateSet('setup','doctor','local','artifacts','plan','review','verify','status','cleanup-preview','destroy-plan')][string]$Command = 'doctor',
  [string]$Profile = '',
  [string]$Region = 'ap-southeast-1',
  [string]$PresenterCidr = '',
  [ValidateSet('RETAIN_PROTECTED_VOLUMES','DELETE_PROTECTED_VOLUMES')][string]$VolumeDecision,
  [switch]$ConfirmDetectedCidr,
  [switch]$Build
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot

function Write-Check([string]$Name,[bool]$Ready,[string]$Detail) {
  $state = if ($Ready) { 'READY' } else { 'NOT_READY' }
  Write-Host ("[{0}] {1}: {2}" -f $state,$Name,$Detail)
}

function Require-Command([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  Write-Check $Name ($null -ne $command) $(if ($command) { (& $Name --version 2>&1 | Select-Object -First 1) } else { 'not found on PATH' })
  return $null -ne $command
}

function Assert-Profile {
  if ([string]::IsNullOrWhiteSpace($Profile)) { throw 'Pass -Profile <authorized-profile>. Profile selection is never assumed.' }
  $raw = @(& aws sts get-caller-identity --profile $Profile --region $Region --output json --no-cli-pager 2>&1)
  if ($LASTEXITCODE -ne 0) { throw "STS failed for profile '$Profile'. Run AWS SSO login explicitly when applicable." }
  return (($raw -join "`n") | ConvertFrom-Json)
}

function Invoke-Doctor {
  Write-Output 'AWS Hanoi Local Zone Lab doctor (read-only)'
  $node = Require-Command 'node'
  $npm = Require-Command 'npm'
  $docker = Require-Command 'docker'
  $terraform = Require-Command 'terraform'
  $aws = Require-Command 'aws'
  if ($docker) {
    $compose = @(& docker compose version 2>&1)
    Write-Check 'docker compose' ($LASTEXITCODE -eq 0) ($compose | Select-Object -First 1)
  }
  if ($aws -and $Profile) {
    try { $identity = Assert-Profile; Write-Check 'AWS STS' $true ("profile={0}; account=********{1}; identity redacted" -f $Profile,$identity.Account.Substring($identity.Account.Length-4)) }
    catch { Write-Check 'AWS STS' $false $_.Exception.Message }
  } else { Write-Check 'AWS STS' $false 'not checked; pass -Profile to test an authorized identity' }
  if (-not ($node -and $npm -and $docker -and $terraform -and $aws)) { throw 'One or more required local dependencies are missing.' }
}

function Invoke-Plan {
  $identity = Assert-Profile
  if (-not $PresenterCidr) {
    $detected = (Invoke-RestMethod -Uri 'https://checkip.amazonaws.com' -TimeoutSec 10).Trim()
    if ($detected -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw 'Public IPv4 detection did not return a valid address.' }
    $PresenterCidr = "$detected/32"
    Write-Warning "Detected presenter CIDR proposal: $PresenterCidr"
    if (-not $ConfirmDetectedCidr) { throw 'Verify the proposed IPv4, then rerun with -ConfirmDetectedCidr or pass -PresenterCidr explicitly.' }
  }
  if ($PresenterCidr -eq '0.0.0.0/0' -or $PresenterCidr -notmatch '^\d{1,3}(\.\d{1,3}){3}/32$') { throw 'PresenterCidr must be one verified IPv4 /32; 0.0.0.0/0 is forbidden.' }
  $directory = Join-Path $repoRoot 'infrastructure\terraform\environments\cost_minimal'
  $cleanupOverrides = @(Get-ChildItem -LiteralPath (Join-Path $repoRoot 'infrastructure\terraform\modules') -Filter 'zz_cleanup_override.tf' -File -Recurse -ErrorAction SilentlyContinue)
  if ($cleanupOverrides.Count -gt 0) { throw 'Cleanup-specific Terraform overrides exist. Do not create an apply plan until the reviewed cleanup workflow is completed or explicitly abandoned and those exact generated files are removed.' }
  $artifact = Join-Path $repoRoot 'infrastructure\terraform\artifacts\minimal-images.tar'
  if (-not (Test-Path -LiteralPath $artifact -PathType Leaf)) {
    throw 'Cost-minimal artifact is missing. Run .\lab.ps1 artifacts, inspect its SHA-256 output, then rerun plan.'
  }
  $env:TF_VAR_expected_account_id = $identity.Account
  $env:TF_VAR_aws_profile = $Profile
  $env:TF_VAR_aws_region = $Region
  $env:TF_VAR_benchmark_client_cidrs = ConvertTo-Json -Compress @($PresenterCidr)
  try {
    Push-Location $directory
    & terraform @('init','-input=false')
    if ($LASTEXITCODE -ne 0) { throw 'terraform init failed.' }
    & terraform @('validate','-no-color')
    if ($LASTEXITCODE -ne 0) { throw 'terraform validate failed.' }
    $planArgs = @('plan','-input=false','-no-color','-out=clone-review.tfplan')
    & terraform @planArgs
    if ($LASTEXITCODE -ne 0) { throw 'terraform plan failed. No apply was attempted.' }
    $planFile = Join-Path $directory 'clone-review.tfplan'
    $planDocument = (& terraform @('show','-json','clone-review.tfplan') | Out-String | ConvertFrom-Json)
    $configurationFiles = @(
      Get-ChildItem -LiteralPath $directory -File | Where-Object { $_.Name -like '*.tf' -or $_.Name -eq '.terraform.lock.hcl' }
      Get-ChildItem -LiteralPath (Join-Path $repoRoot 'infrastructure\terraform\modules') -File -Recurse
      Get-ChildItem -LiteralPath (Join-Path $repoRoot 'infrastructure\terraform\cleanup-overrides') -File -Recurse
      Get-Item -LiteralPath $artifact
      Get-ChildItem -LiteralPath (Join-Path $repoRoot 'app\frontend\dist') -File -Recurse
    ) | Sort-Object FullName -Unique
    $configurationHashes = [ordered]@{}
    foreach ($file in $configurationFiles) {
      if (-not $file.FullName.StartsWith($repoRoot,[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Configuration fingerprint escaped the repository root.' }
      $relative = $file.FullName.Substring($repoRoot.Length).TrimStart('\').Replace('\','/')
      $configurationHashes[$relative] = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant()
    }
    $changes = @($planDocument.resource_changes | Where-Object { $_.change.actions -notcontains 'no-op' })
    $manifest = [ordered]@{
      schemaVersion=2; operation='APPLY'; generatedAt=(Get-Date).ToUniversalTime().ToString('o')
      deploymentIdentity='hanoi-lz-live-demo/cost_minimal'; accountId=[string]$identity.Account; awsProfile=$Profile; region=$Region
      terraformRoot='infrastructure/terraform/environments/cost_minimal'
      planPath='infrastructure/terraform/environments/cost_minimal/clone-review.tfplan'
      planSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $planFile).Hash.ToLowerInvariant()
      configurationFiles=$configurationHashes
      changes=[ordered]@{
        create=@($changes | Where-Object { $_.change.actions -contains 'create' }).Count
        update=@($changes | Where-Object { $_.change.actions -contains 'update' }).Count
        delete=@($changes | Where-Object { $_.change.actions -contains 'delete' }).Count
        addresses=@($changes | ForEach-Object { [ordered]@{ address=$_.address; actions=@($_.change.actions) } })
      }
      exactExecutable='terraform'
      exactArguments=@('apply','-input=false','-no-color','clone-review.tfplan')
      exactCommand='terraform apply -input=false -no-color clone-review.tfplan'
      expectedEffects='Creates only the resources in this immutable saved plan; normal AWS charges begin after apply.'
    }
    $manifestDirectory = Join-Path $repoRoot 'evidence\lifecycle'
    New-Item -ItemType Directory -Force -Path $manifestDirectory | Out-Null
    $manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $manifestDirectory 'active-apply-plan.json') -Encoding utf8
    Write-Output 'Saved local review plan: infrastructure/terraform/environments/cost_minimal/clone-review.tfplan'
    Write-Output ("Approval manifest SHA-256: {0}" -f $manifest.planSha256)
    Write-Output 'STOP: this command never runs terraform apply.'
  } finally {
    Pop-Location
    Remove-Item Env:TF_VAR_expected_account_id -ErrorAction SilentlyContinue
    Remove-Item Env:TF_VAR_aws_profile -ErrorAction SilentlyContinue
    Remove-Item Env:TF_VAR_aws_region -ErrorAction SilentlyContinue
    Remove-Item Env:TF_VAR_benchmark_client_cidrs -ErrorAction SilentlyContinue
  }
}

function Invoke-Artifacts {
  & (Join-Path $repoRoot 'infrastructure\terraform\scripts\build-artifacts.ps1') -Target CostMinimal
  if ($LASTEXITCODE -ne 0) { throw 'Cost-minimal artifact build failed.' }
}

function Invoke-Review {
  $directory = Join-Path $repoRoot 'infrastructure\terraform\environments\cost_minimal'
  $plan = Join-Path $directory 'clone-review.tfplan'
  if (-not (Test-Path -LiteralPath $plan -PathType Leaf)) { throw 'No saved clone-review.tfplan exists. Run .\lab.ps1 plan first.' }
  Push-Location $directory
  try {
    & terraform @('show','-no-color','clone-review.tfplan')
    if ($LASTEXITCODE -ne 0) { throw 'terraform show failed; the saved plan was not accepted as review evidence.' }
    Write-Output 'READ_ONLY REVIEW: no apply was attempted.'
  } finally { Pop-Location }
}

function Invoke-CleanupPreview {
  $identity = Assert-Profile
  $project = 'hanoi-lz-live-demo'; $environment = 'cost_minimal'
  function Invoke-AwsReadOnly([string[]]$Arguments) {
    $raw = @(& aws @Arguments --profile $Profile --region $Region --output json --no-cli-pager 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "Read-only AWS inventory failed: aws $($Arguments[0..1] -join ' ')" }
    return (($raw -join "`n") | ConvertFrom-Json)
  }
  $instances = Invoke-AwsReadOnly @('ec2','describe-instances','--filters',"Name=tag:Project,Values=$project","Name=tag:Environment,Values=$environment",'Name=instance-state-name,Values=pending,running,stopping,stopped')
  $volumes = Invoke-AwsReadOnly @('ec2','describe-volumes','--filters',"Name=tag:Project,Values=$project","Name=tag:Environment,Values=$environment",'Name=status,Values=creating,available,in-use,error')
  $addresses = Invoke-AwsReadOnly @('ec2','describe-addresses','--filters',"Name=tag:Project,Values=$project","Name=tag:Environment,Values=$environment")
  $vpcs = Invoke-AwsReadOnly @('ec2','describe-vpcs','--filters',"Name=tag:Project,Values=$project","Name=tag:Environment,Values=$environment")
  $securityGroups = Invoke-AwsReadOnly @('ec2','describe-security-groups','--filters',"Name=tag:Project,Values=$project","Name=tag:Environment,Values=$environment")
  $secrets = Invoke-AwsReadOnly @('secretsmanager','list-secrets','--include-planned-deletion')
  $relatedSecrets = @($secrets.SecretList | Where-Object { $_ -and $_.Name -match 'hanoi|cost-minimal|cost_minimal' })
  $stateRoot = Join-Path $repoRoot 'infrastructure\terraform\environments\cost_minimal'
  Push-Location $stateRoot
  try {
    $stateAddresses = @(& terraform @('state','list') 2>$null)
    $managedStateResources = if ($LASTEXITCODE -eq 0) { $stateAddresses.Count } else { -1 }
  } finally { Pop-Location }
  $reviewedBuckets = @()
  $inventoryPath = Join-Path $repoRoot 'evidence\lifecycle\destroy-cleanup-inventory.json'
  if (Test-Path -LiteralPath $inventoryPath -PathType Leaf) {
    $inventory = Get-Content -Raw -LiteralPath $inventoryPath | ConvertFrom-Json
    foreach ($bucket in @($inventory.buckets)) {
      & aws s3api head-bucket --bucket ([string]$bucket.name) --profile $Profile --region $Region --no-cli-pager 2>$null
      $reviewedBuckets += [ordered]@{ name=[string]$bucket.name; exists=($LASTEXITCODE -eq 0) }
    }
  }
  $active = [ordered]@{
    ec2=@($instances.Reservations | ForEach-Object Instances | Where-Object { $_ }).Count
    ebs=@($volumes.Volumes | Where-Object { $_ }).Count
    elasticIps=@($addresses.Addresses | Where-Object { $_ }).Count
    vpcs=@($vpcs.Vpcs | Where-Object { $_ }).Count
    securityGroups=@($securityGroups.SecurityGroups | Where-Object { $_ }).Count
    reviewedS3Buckets=@($reviewedBuckets | Where-Object exists).Count
    secrets=@($relatedSecrets | Where-Object { $null -eq $_.DeletedDate }).Count
    secretsPendingDeletion=@($relatedSecrets | Where-Object { $null -ne $_.DeletedDate }).Count
    terraformStateResources=$managedStateResources
  }
  $clean = $active.ec2 -eq 0 -and $active.ebs -eq 0 -and $active.elasticIps -eq 0 -and $active.vpcs -eq 0 -and $active.securityGroups -eq 0 -and $active.reviewedS3Buckets -eq 0 -and $active.secrets -eq 0 -and $active.terraformStateResources -eq 0
  $document = [ordered]@{
    schemaVersion=1; status='SUCCEEDED'; operation='READ_ONLY_CLEANUP_PREVIEW'; checkedAt=(Get-Date).ToUniversalTime().ToString('o')
    deploymentIdentity='hanoi-lz-live-demo/cost_minimal'; profile=$Profile; accountSuffix=$identity.Account.Substring($identity.Account.Length-4); region=$Region
    clean=$clean; active=$active; reviewedBuckets=$reviewedBuckets
    note='No stop, terminate, release, delete, restore, apply, destroy, secret cancellation or state removal call was made. Pending-deletion secrets are reported separately and do not count as active.'
  }
  $evidencePath = Join-Path $repoRoot 'evidence\aws-cleanup-preview-latest.json'
  $document | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $evidencePath -Encoding utf8
  $document | ConvertTo-Json -Depth 8
}

function Invoke-DestroyPlan {
  $identity = Assert-Profile
  $manifestDirectory = Join-Path $repoRoot 'evidence\lifecycle'
  New-Item -ItemType Directory -Force -Path $manifestDirectory | Out-Null
  if (-not $VolumeDecision) { throw 'Pass -VolumeDecision RETAIN_PROTECTED_VOLUMES or DELETE_PROTECTED_VOLUMES. The decision is never inferred.' }
  if ($VolumeDecision -eq 'RETAIN_PROTECTED_VOLUMES') {
    [ordered]@{
      schemaVersion=1; status='BLOCKED'; operation='DESTROY_PLAN'; generatedAt=(Get-Date).ToUniversalTime().ToString('o')
      deploymentIdentity='hanoi-lz-live-demo/cost_minimal'; accountSuffix=([string]$identity.Account).Substring(([string]$identity.Account).Length-4)
      profile=$Profile; region=$Region; retentionDecision=$VolumeDecision
      reason='A full Terraform destroy cannot both retain the two Terraform-managed PostgreSQL volumes and truthfully claim zero managed resources. No plan or state detachment was performed.'
    } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $manifestDirectory 'destroy-retention-review.json') -Encoding utf8
    throw 'RETAIN_PROTECTED_VOLUMES blocks full destroy-plan generation. The volumes remain protected and managed; no terraform state rm shortcut is used.'
  }

  $directory = Join-Path $repoRoot 'infrastructure\terraform\environments\cost_minimal'
  Push-Location $directory
  try {
    $stateAddresses = @(& terraform @('state','list') 2>&1)
    if ($LASTEXITCODE -ne 0) { throw 'terraform state list failed; destroy preparation cannot identify the current managed deployment.' }
    if ($stateAddresses.Count -eq 0) { throw 'No Terraform-managed resources exist. Current lifecycle state remains NOT_DEPLOYED; no destroy plan is needed.' }
    $presenterRule = [string]($stateAddresses | Where-Object { $_ -match '^aws_vpc_security_group_ingress_rule\.api\["' } | Select-Object -First 1)
    if ($presenterRule -notmatch 'api\["([^\"]+/32)"\]') { throw 'The deployed state does not expose one reviewed presenter IPv4 /32 rule.' }
    $statePresenterCidr = $Matches[1]
    $outputText = (& terraform @('output','-json') 2>&1 | Out-String)
    if ($LASTEXITCODE -ne 0) { throw 'terraform output -json failed; cleanup targets cannot be resolved from the active state.' }
    $outputs = $outputText | ConvertFrom-Json
  } finally { Pop-Location }

  function Invoke-AwsJson([string[]]$Arguments) {
    $raw = @(& aws @Arguments --profile $Profile --region $Region --output json --no-cli-pager 2>&1)
    if ($LASTEXITCODE -ne 0) { throw "Read-only AWS cleanup inventory failed: aws $($Arguments[0..1] -join ' ')" }
    return (($raw -join "`n") | ConvertFrom-Json)
  }
  $bucketNames = @([string]$outputs.artifact.value.bucket,[string]$outputs.frontend_bucket_name.value)
  if ($bucketNames.Count -ne 2 -or @($bucketNames | Where-Object { $_ -notmatch '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$' }).Count -gt 0) { throw 'Terraform outputs did not resolve exactly two in-scope S3 buckets.' }
  $bucketInventory = @()
  foreach ($bucketName in $bucketNames) {
    $versions = Invoke-AwsJson @('s3api','list-object-versions','--bucket',$bucketName)
    $rows = @(
      @($versions.Versions | Where-Object { $_ } | ForEach-Object { [ordered]@{ key=[string]$_.Key; versionId=[string]$_.VersionId; kind='VERSION'; size=[long]$_.Size } })
      @($versions.DeleteMarkers | Where-Object { $_ } | ForEach-Object { [ordered]@{ key=[string]$_.Key; versionId=[string]$_.VersionId; kind='DELETE_MARKER'; size=0 } })
    ) | Sort-Object kind,key,versionId
    $bucketInventory += [ordered]@{ name=$bucketName; versions=@($rows); versionCount=@($rows | Where-Object kind -eq 'VERSION').Count; deleteMarkerCount=@($rows | Where-Object kind -eq 'DELETE_MARKER').Count }
  }
  $inventoryPath = Join-Path $manifestDirectory 'destroy-cleanup-inventory.json'
  [ordered]@{
    schemaVersion=1; generatedAt=(Get-Date).ToUniversalTime().ToString('o'); deploymentIdentity='hanoi-lz-live-demo/cost_minimal'
    accountSuffix=([string]$identity.Account).Substring(([string]$identity.Account).Length-4); profile=$Profile; region=$Region
    protectedVolumeDecision=$VolumeDecision; protectedVolumeAddresses=@('module.singapore.aws_ebs_volume.data','module.hanoi.aws_ebs_volume.data')
    buckets=$bucketInventory; note='Read-only exact S3 version/delete-marker inventory. The authorized executor must revalidate it immediately before the saved destroy plan runs.'
  } | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $inventoryPath -Encoding utf8

  $volumeOverride = Join-Path $repoRoot 'infrastructure\terraform\modules\colocated_app\zz_cleanup_override.tf'
  $artifactOverride = Join-Path $repoRoot 'infrastructure\terraform\modules\artifact_bucket\zz_cleanup_override.tf'
  $frontendOverride = Join-Path $repoRoot 'infrastructure\terraform\modules\static_frontend\zz_cleanup_override.tf'
  Copy-Item -LiteralPath (Join-Path $repoRoot 'infrastructure\terraform\cleanup-overrides\colocated_app.tf') -Destination $volumeOverride -Force
  foreach ($override in @($artifactOverride,$frontendOverride)) {
    Copy-Item -LiteralPath (Join-Path $repoRoot 'infrastructure\terraform\cleanup-overrides\s3_bucket.tf') -Destination $override -Force
  }

  $env:TF_VAR_expected_account_id = $identity.Account
  $env:TF_VAR_aws_profile = $Profile
  $env:TF_VAR_aws_region = $Region
  $env:TF_VAR_benchmark_client_cidrs = ConvertTo-Json -Compress @($statePresenterCidr)
  try {
    Push-Location $directory
    & terraform @('init','-input=false')
    if ($LASTEXITCODE -ne 0) { throw 'terraform init failed during destroy preparation.' }
    & terraform @('validate','-no-color')
    if ($LASTEXITCODE -ne 0) { throw 'Cleanup-specific Terraform override validation failed.' }
    & terraform @('plan','-destroy','-input=false','-no-color','-out=destroy-review.tfplan')
    if ($LASTEXITCODE -ne 0) { throw 'terraform plan -destroy failed. No destroy was attempted.' }
    $planFile = Join-Path $directory 'destroy-review.tfplan'
    $planDocument = (& terraform @('show','-json','destroy-review.tfplan') | Out-String | ConvertFrom-Json)
    $changes = @($planDocument.resource_changes | Where-Object { $_.change.actions -notcontains 'no-op' })
    if ($changes.Count -eq 0) { throw 'Destroy plan contains no managed resource changes.' }
    $unexpected = @($changes | Where-Object { @($_.change.actions).Count -ne 1 -or $_.change.actions[0] -ne 'delete' })
    if ($unexpected.Count -gt 0) { throw 'Destroy plan contains a non-delete action and was rejected.' }
    $artifact = Join-Path $repoRoot 'infrastructure\terraform\artifacts\minimal-images.tar'
    $configurationFiles = @(
      Get-ChildItem -LiteralPath $directory -File | Where-Object { $_.Name -like '*.tf' -or $_.Name -eq '.terraform.lock.hcl' }
      Get-ChildItem -LiteralPath (Join-Path $repoRoot 'infrastructure\terraform\modules') -File -Recurse
      Get-ChildItem -LiteralPath (Join-Path $repoRoot 'infrastructure\terraform\cleanup-overrides') -File -Recurse
      Get-Item -LiteralPath $artifact
      Get-ChildItem -LiteralPath (Join-Path $repoRoot 'app\frontend\dist') -File -Recurse
    ) | Sort-Object FullName -Unique
    $configurationHashes = [ordered]@{}
    foreach ($file in $configurationFiles) {
      if (-not $file.FullName.StartsWith($repoRoot,[System.StringComparison]::OrdinalIgnoreCase)) { throw 'Destroy configuration fingerprint escaped the repository root.' }
      $relative = $file.FullName.Substring($repoRoot.Length).TrimStart('\').Replace('\','/')
      $configurationHashes[$relative] = (Get-FileHash -Algorithm SHA256 -LiteralPath $file.FullName).Hash.ToLowerInvariant()
    }
    $manifest = [ordered]@{
      schemaVersion=2; operation='DESTROY'; generatedAt=(Get-Date).ToUniversalTime().ToString('o')
      deploymentIdentity='hanoi-lz-live-demo/cost_minimal'; accountId=[string]$identity.Account; awsProfile=$Profile; region=$Region
      terraformRoot='infrastructure/terraform/environments/cost_minimal'
      planPath='infrastructure/terraform/environments/cost_minimal/destroy-review.tfplan'
      planSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $planFile).Hash.ToLowerInvariant(); configurationFiles=$configurationHashes
      changes=[ordered]@{ create=0; update=0; delete=$changes.Count; addresses=@($changes | ForEach-Object { [ordered]@{ address=$_.address; actions=@($_.change.actions) } }) }
      exactExecutable='terraform'; exactArguments=@('apply','-input=false','-no-color','destroy-review.tfplan')
      exactCommand='terraform apply -input=false -no-color destroy-review.tfplan'
      expectedEffects='Deletes only resources represented by the immutable destroy plan. The two protected PostgreSQL volumes and exact inventoried S3 versions/delete markers are deleted because DELETE_PROTECTED_VOLUMES was explicitly selected.'
      retentionDecision=$VolumeDecision; cleanupInventoryPath='evidence/lifecycle/destroy-cleanup-inventory.json'
      cleanupInventorySha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $inventoryPath).Hash.ToLowerInvariant()
    }
    $manifest | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $manifestDirectory 'active-destroy-plan.json') -Encoding utf8
    Write-Output 'Saved local destroy review plan: infrastructure/terraform/environments/cost_minimal/destroy-review.tfplan'
    Write-Output ("Destroy approval manifest SHA-256: {0}" -f $manifest.planSha256)
    Write-Output 'STOP: this command never runs terraform apply or terraform destroy.'
  } finally {
    Pop-Location
    Remove-Item Env:TF_VAR_expected_account_id -ErrorAction SilentlyContinue
    Remove-Item Env:TF_VAR_aws_profile -ErrorAction SilentlyContinue
    Remove-Item Env:TF_VAR_aws_region -ErrorAction SilentlyContinue
    Remove-Item Env:TF_VAR_benchmark_client_cidrs -ErrorAction SilentlyContinue
  }
}

function Start-LocalAgent {
  try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 2
    if ($health.status -eq 'ok') { Write-Output 'Localhost control agent: READY (existing process)'; return }
  } catch { }
  & npm run build --workspace '@hanoi-lab/agent'
  if ($LASTEXITCODE -ne 0) { throw 'Localhost agent build failed.' }
  $stdout = Join-Path $repoRoot 'evidence\agent-local.stdout.log'
  $stderr = Join-Path $repoRoot 'evidence\agent-local.stderr.log'
  $oldRoot = $env:LAB_REPO_ROOT; $oldHost = $env:AGENT_HOST; $oldPort = $env:AGENT_PORT; $oldProfile = $env:AWS_PROFILE
  try {
    $env:LAB_REPO_ROOT = $repoRoot; $env:AGENT_HOST = '127.0.0.1'; $env:AGENT_PORT = '3001'
    if ($Profile) { $env:AWS_PROFILE = $Profile }
    Start-Process -FilePath (Get-Command node).Source -ArgumentList @('agent/dist/index.js') -WorkingDirectory $repoRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr | Out-Null
  } finally {
    $env:LAB_REPO_ROOT = $oldRoot; $env:AGENT_HOST = $oldHost; $env:AGENT_PORT = $oldPort; $env:AWS_PROFILE = $oldProfile
  }
  for ($attempt=1; $attempt -le 20; $attempt++) {
    try { $health = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/health' -TimeoutSec 2; if ($health.status -eq 'ok') { Write-Output 'Localhost control agent: READY'; return } } catch { Start-Sleep -Milliseconds 500 }
  }
  throw "Localhost agent did not become ready. Inspect $stderr"
}

switch ($Command) {
  'setup' { Invoke-Doctor; Write-Output 'Next: copy .env.emulation.example to .env only if you need overrides, then run .\lab.ps1 local -Build.' }
  'doctor' { Invoke-Doctor }
  'local' { & (Join-Path $repoRoot 'scripts\emulation\start.ps1') -Build:$Build; if ($LASTEXITCODE -ne 0) { throw 'Local emulation start failed.' }; Start-LocalAgent; Write-Output 'Portal: http://localhost:3000'; Write-Output 'Mini order app: http://localhost:8081' }
  'artifacts' { Invoke-Artifacts }
  'plan' { Invoke-Plan }
  'review' { Invoke-Review }
  'verify' { & (Join-Path $repoRoot 'scripts\emulation\verify-scenarios.ps1'); if ($LASTEXITCODE -ne 0) { throw 'Local scenario verification failed.' } }
  'status' { if (-not $Profile) { throw 'Pass -Profile for the combined local/AWS read-only status check.' }; & (Join-Path $repoRoot 'scripts\preflight\live-demo.ps1') -Profile $Profile }
  'cleanup-preview' { Invoke-CleanupPreview }
  'destroy-plan' { Invoke-DestroyPlan }
}
