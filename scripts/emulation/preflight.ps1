param([switch]$WriteEvidence,[switch]$SummaryOnly)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$compose = @('compose', '-f', (Join-Path $root 'docker-compose.yml'), '-f', (Join-Path $root 'docker-compose.emulation.yml'))
$requiredServices = @('db','backend','frontend','dashboard','toxiproxy','sg-db','han-db','recovery-db','sg-api','han-api','hybrid-api')
$checks = @()

function Add-Check([string]$Name, [bool]$Passed, [string]$Detail) {
  $script:checks += [ordered]@{ name=$Name; passed=$Passed; detail=$Detail; checkedAt=(Get-Date).ToUniversalTime().ToString('o') }
  $label = if ($Passed) { 'PASS' } else { 'FAIL' }
  Write-Output "[$label] $Name - $Detail"
}

& docker @compose config --quiet
if ($LASTEXITCODE -ne 0) { throw 'Compose configuration is invalid.' }
Add-Check 'Compose configuration' $true 'base and emulation overlays parse successfully'

$running = @(& docker @compose ps --status running --services)
foreach ($service in $requiredServices) {
  $containerDetail = if($running -contains $service){'running'}else{'not running'}
  Add-Check "Container $service" ($running -contains $service) $containerDetail
}

$endpoints = @(
  @{ Name='Order application'; Url='http://127.0.0.1:8081/health' },
  @{ Name='Dashboard'; Url='http://127.0.0.1:3000/health' },
  @{ Name='Control agent'; Url='http://127.0.0.1:3001/health' },
  @{ Name='Case 1 Singapore-shaped API'; Url='http://127.0.0.1:8101/health' },
  @{ Name='Case 2 Hanoi-shaped API'; Url='http://127.0.0.1:8102/health' },
  @{ Name='Case 3 hybrid API'; Url='http://127.0.0.1:8103/health' }
)
foreach ($endpoint in $endpoints) {
  try { $response=Invoke-RestMethod -Uri $endpoint.Url -TimeoutSec 8; Add-Check $endpoint.Name ($response.status -eq 'ok') "$($endpoint.Url) status=$($response.status)" }
  catch { Add-Check $endpoint.Name $false "$($endpoint.Url) unavailable: $($_.Exception.Message)" }
}

$proxyExpectations = @(
  @{ Name='sg_http'; Delay=18 }, @{ Name='han_http'; Delay=4 }, @{ Name='hybrid_http'; Delay=18 }, @{ Name='hybrid_db'; Delay=12 }
)
$configJson = (& docker @compose config --format json) -join "`n" | ConvertFrom-Json
$initEnvironment = $configJson.services.'emulation-init'.environment
$proxyExpectations[0].Delay=[int]$initEnvironment.EMULATED_SG_ONE_WAY_MS
$proxyExpectations[1].Delay=[int]$initEnvironment.EMULATED_HAN_ONE_WAY_MS
$proxyExpectations[2].Delay=[int]$initEnvironment.EMULATED_SG_ONE_WAY_MS
$proxyExpectations[3].Delay=[int]$initEnvironment.EMULATED_CROSS_ZONE_ONE_WAY_MS
foreach ($proxy in $proxyExpectations) {
  $inspection = (& docker @compose exec -T toxiproxy /toxiproxy-cli inspect $proxy.Name 2>&1) -join "`n"
  $passed = $LASTEXITCODE -eq 0 -and $inspection -match "latency=$($proxy.Delay)" -and $inspection -match 'stream=upstream' -and $inspection -match 'stream=downstream'
  Add-Check "Toxiproxy $($proxy.Name)" $passed "operator-defined illustrative delay=$($proxy.Delay) ms each direction; both streams configured=$passed"
}

foreach ($database in @('sg-db','han-db')) {
  $oldPreference=$ErrorActionPreference;$ErrorActionPreference='Continue';$count=(@(& docker @compose exec -T $database psql -U hanoi_app -d hanoi_lab -Atc 'select count(*) from orders;' 2>&1)-join '');$exit=$LASTEXITCODE;$ErrorActionPreference=$oldPreference
  Add-Check "Database $database" ($exit -eq 0 -and $count -match '^\d+$') "orders=$count"
}
$oldPreference=$ErrorActionPreference;$ErrorActionPreference='Continue';$recoveryProbe=(@(& docker @compose exec -T recovery-db psql -U hanoi_app -d hanoi_lab -Atc 'select 1;' 2>&1)-join '');$recoveryExit=$LASTEXITCODE;$ErrorActionPreference=$oldPreference
Add-Check 'Database recovery-db' ($recoveryExit -eq 0 -and $recoveryProbe -eq '1') 'reachable; schema may be empty until Case 5 restore'

$passed = @($checks | Where-Object { -not $_.passed }).Count -eq 0
$document = [ordered]@{ status=if($passed){'SUCCEEDED'}else{'FAILED'}; mode='LOCAL_NETWORK_EMULATION'; checkedAt=(Get-Date).ToUniversalTime().ToString('o'); illustrativeParameters=$true; checks=$checks }
if ($WriteEvidence) { $document | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $root 'evidence\preflight-latest.json') -Encoding utf8 }
if (-not $passed) { throw 'Preflight failed. Review FAIL entries before presenting.' }
if(-not $SummaryOnly){$document | ConvertTo-Json -Depth 6}
