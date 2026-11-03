[CmdletBinding()]
param(
  [Parameter(Position=0)][ValidateSet('setup','doctor','local','artifacts','plan','review','verify','status','cleanup-preview')][string]$Command = 'doctor',
  [string]$Profile = '',
  [string]$Region = 'ap-southeast-1',
  [string]$PresenterCidr = '',
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
    $planArgs = @('plan','-input=false','-lock=false','-no-color','-out=clone-review.tfplan')
    & terraform @planArgs
    if ($LASTEXITCODE -ne 0) { throw 'terraform plan failed. No apply was attempted.' }
    $planFile = Join-Path $directory 'clone-review.tfplan'
    $planDocument = (& terraform @('show','-json','clone-review.tfplan') | Out-String | ConvertFrom-Json)
    $configurationFiles = @(
      Get-ChildItem -LiteralPath $directory -File | Where-Object { $_.Name -like '*.tf' -or $_.Name -eq '.terraform.lock.hcl' }
      Get-ChildItem -LiteralPath (Join-Path $repoRoot 'infrastructure\terraform\modules') -File -Recurse
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
      schemaVersion=1; operation='APPLY'; generatedAt=(Get-Date).ToUniversalTime().ToString('o')
      deploymentIdentity='hanoi-lz-live-demo/cost_minimal'; accountId=[string]$identity.Account; region=$Region
      planPath='infrastructure/terraform/environments/cost_minimal/clone-review.tfplan'
      planSha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $planFile).Hash.ToLowerInvariant()
      configurationFiles=$configurationHashes
      changes=[ordered]@{
        create=@($changes | Where-Object { $_.change.actions -contains 'create' }).Count
        update=@($changes | Where-Object { $_.change.actions -contains 'update' }).Count
        delete=@($changes | Where-Object { $_.change.actions -contains 'delete' }).Count
        addresses=@($changes | ForEach-Object { [ordered]@{ address=$_.address; actions=@($_.change.actions) } })
      }
      exactCommand='terraform apply -input=false clone-review.tfplan'
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
  $secrets = Invoke-AwsReadOnly @('secretsmanager','list-secrets','--include-planned-deletion')
  $relatedSecrets = @($secrets.SecretList | Where-Object { $_ -and $_.Name -match 'hanoi|cost-minimal|cost_minimal' })
  [ordered]@{
    operation='READ_ONLY_CLEANUP_PREVIEW'; profile=$Profile; accountSuffix=$identity.Account.Substring($identity.Account.Length-4); region=$Region
    active=[ordered]@{
      ec2=@($instances.Reservations | ForEach-Object Instances | Where-Object { $_ }).Count
      ebs=@($volumes.Volumes | Where-Object { $_ }).Count
      elasticIps=@($addresses.Addresses | Where-Object { $_ }).Count
      secrets=@($relatedSecrets | Where-Object { $null -eq $_.DeletedDate }).Count
      secretsPendingDeletion=@($relatedSecrets | Where-Object { $null -ne $_.DeletedDate }).Count
    }
    note='No stop, terminate, release, delete, restore, apply or destroy call was made.'
  } | ConvertTo-Json -Depth 5
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
}
