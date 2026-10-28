param(
  [Parameter(Mandatory)][ValidateSet('Smoke','CostMinimal','Full')][string]$Environment,
  [string]$PresenterCidr = '198.51.100.24/32'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$target = if ($Environment -eq 'CostMinimal') { 'cost_minimal' } else { $Environment.ToLowerInvariant() }
$directory = Join-Path $root "environments\$target"
$accountId = (& aws sts get-caller-identity --profile thangvn --query Account --output text 2>$null).Trim()
if ($LASTEXITCODE -ne 0 -or -not $accountId) { throw 'AWS profile thangvn is not authenticated.' }
$env:TF_VAR_expected_account_id = $accountId
if ($target -eq 'cost_minimal') { $env:TF_VAR_benchmark_client_cidrs = ConvertTo-Json -Compress @($PresenterCidr) }
Push-Location $directory
try {
  Write-Output 'Retained-data protections are expected to block destruction of EBS data volumes and RDS until an operator reviews and deliberately changes those guards.'
  & terraform @('plan','-destroy','-input=false','-lock=false','-no-color')
  exit $LASTEXITCODE
} finally { Pop-Location }
