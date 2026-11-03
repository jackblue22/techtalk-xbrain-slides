param(
  [ValidateSet('Smoke','CostMinimal','Full','All')][string]$Environment = 'CostMinimal',
  [Parameter(Mandatory)][string]$Profile,
  [string]$Region = 'ap-southeast-1',
  [string]$PresenterCidr = '',
  [switch]$ConfirmDetectedCidr
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$accountId = (& aws sts get-caller-identity --profile $Profile --region $Region --query Account --output text 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or -not $accountId) { throw "AWS profile '$Profile' is not authenticated." }
$env:TF_VAR_expected_account_id = $accountId
$env:TF_VAR_aws_profile = $Profile
$env:TF_VAR_aws_region = $Region

$targets = if ($Environment -eq 'All') { @('smoke','cost_minimal','full') } elseif ($Environment -eq 'CostMinimal') { @('cost_minimal') } else { @($Environment.ToLowerInvariant()) }
foreach ($target in $targets) {
  $directory = Join-Path $root "environments\$target"
  Push-Location $directory
  try {
    if ($target -eq 'cost_minimal') {
      if (-not $PresenterCidr) {
        $publicIp = (Invoke-RestMethod -Uri 'https://checkip.amazonaws.com' -TimeoutSec 10).Trim()
        if ($publicIp -notmatch '^\d{1,3}(\.\d{1,3}){3}$') { throw 'Could not determine a valid presenter public IPv4 address.' }
        $PresenterCidr = "$publicIp/32"
        Write-Warning "Detected presenter CIDR proposal: $PresenterCidr"
        if (-not $ConfirmDetectedCidr) { throw 'Verify the proposal, then rerun with -ConfirmDetectedCidr or pass -PresenterCidr explicitly.' }
      }
      if ($PresenterCidr -eq '0.0.0.0/0' -or $PresenterCidr -notmatch '^\d{1,3}(\.\d{1,3}){3}/32$') { throw 'PresenterCidr must be one verified IPv4 /32; a world-open CIDR is forbidden.' }
      $env:TF_VAR_benchmark_client_cidrs = ConvertTo-Json -Compress @($PresenterCidr)
      Write-Host "cost_minimal API ingress plan is restricted to presenter CIDR $PresenterCidr"
    }
    & terraform @('init','-input=false')
    if ($LASTEXITCODE -ne 0) { throw "$target terraform init failed." }
    & terraform @('validate','-no-color')
    if ($LASTEXITCODE -ne 0) { throw "$target terraform validate failed." }
    $plan = "phase2b2-$target.tfplan"
    $planLog = "phase2b2-$target-plan.log"
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    & terraform @('plan','-input=false','-lock=false','-no-color',"-out=$plan") *> $planLog
    $planExit = $LASTEXITCODE
    $ErrorActionPreference = $previousPreference
    if ($planExit -ne 0) {
      $safeError = (Get-Content -LiteralPath $planLog -Raw) -replace '\b\d{12}\b','[ACCOUNT_REDACTED]'
      Write-Error $safeError
      throw "$target terraform plan failed."
    }
    $json = (& terraform show -json $plan | Out-String | ConvertFrom-Json)
    $creates = @($json.resource_changes | Where-Object { $_.change.actions -contains 'create' })
    [ordered]@{
      environment = $target
      planFile = $plan
      create = $creates.Count
      change = @($json.resource_changes | Where-Object { $_.change.actions -contains 'update' }).Count
      destroy = @($json.resource_changes | Where-Object { $_.change.actions -contains 'delete' }).Count
      resourceTypes = [ordered]@{}
    } | ForEach-Object {
      foreach ($group in ($creates | Group-Object type | Sort-Object Name)) { $_.resourceTypes[$group.Name] = $group.Count }
      $_
    } | ConvertTo-Json -Depth 6
  } finally { Pop-Location }
}
Remove-Item Env:TF_VAR_expected_account_id,Env:TF_VAR_aws_profile,Env:TF_VAR_aws_region,Env:TF_VAR_benchmark_client_cidrs -ErrorAction SilentlyContinue
