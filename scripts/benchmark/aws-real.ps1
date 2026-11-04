param(
  [ValidateSet('All','Singapore','Hanoi','Hybrid')][string]$Scenario = 'All',
  [ValidateSet('CostMinimal','FullManaged')][string]$Profile = 'CostMinimal',
  [ValidateRange(1,300)][int]$Samples = 100,
  [ValidateRange(0,50)][int]$Warmups = 5,
  [string]$SingaporeEndpoint,
  [string]$HanoiEndpoint,
  [string]$HybridEndpoint,
  [Parameter(Mandatory)][string]$Origin
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

if (-not $SingaporeEndpoint -or -not $HanoiEndpoint -or ($Profile -eq 'CostMinimal' -and -not $HybridEndpoint)) {
  $environment = if ($Profile -eq 'CostMinimal') { 'cost_minimal' } else { 'full' }
  Push-Location (Join-Path $root "infrastructure\terraform\environments\$environment")
  try {
    $outputs = terraform output -json | ConvertFrom-Json
    if ($Profile -eq 'CostMinimal') {
      if (-not $SingaporeEndpoint) { $SingaporeEndpoint = [string]$outputs.singapore_api_endpoint.value }
      if (-not $HanoiEndpoint) { $HanoiEndpoint = [string]$outputs.hanoi_api_endpoint.value }
      if (-not $HybridEndpoint) { $HybridEndpoint = [string]$outputs.hybrid_api_endpoint.value }
    } else {
      if (-not $SingaporeEndpoint) { $SingaporeEndpoint = [string]$outputs.singapore_endpoint.value }
      if (-not $HanoiEndpoint) { $HanoiEndpoint = [string]$outputs.hanoi_endpoint.value }
    }
  } finally { Pop-Location }
}

$targets = @(
  @{ Name='AWS_REAL_SINGAPORE'; BaseUrl=$SingaporeEndpoint },
  @{ Name='AWS_REAL_HANOI'; BaseUrl=$HanoiEndpoint }
)
if ($Profile -eq 'CostMinimal') { $targets += @{ Name='AWS_REAL_HYBRID'; BaseUrl=$HybridEndpoint } }
if ($Scenario -ne 'All') { $targets = @($targets | Where-Object { $_.Name -eq "AWS_REAL_$($Scenario.ToUpperInvariant())" }) }
$runId = [guid]::NewGuid().ToString()
$startedAt = (Get-Date).ToUniversalTime().ToString('o')
$raw = @(); $warmupRecords = @(); $summaries = @(); $topologies = @()

function Get-Percentile([double[]]$Sorted,[double]$P) {
  if ($Sorted.Count -eq 0) { return $null }
  $rank=($Sorted.Count-1)*$P; $low=[math]::Floor($rank); $high=[math]::Ceiling($rank); $weight=$rank-$low
  return $Sorted[$low]*(1-$weight)+$Sorted[$high]*$weight
}
function Get-Statistics($Group,[int]$Expected) {
  $success=@($Group|Where-Object ok); $values=@($success.clientElapsedMs|Sort-Object); $errors=$Expected-$success.Count
  if ($values.Count -eq 0) { return [ordered]@{count=0;errors=$errors;errorRate=100;p50=$null;p95=$null;p99=$null;mean=$null;min=$null;max=$null;standardDeviation=$null} }
  $mean=($values|Measure-Object -Average).Average
  $variance=($values|ForEach-Object{($_-$mean)*($_-$mean)}|Measure-Object -Average).Average
  [ordered]@{count=$values.Count;errors=$errors;errorRate=[math]::Round($errors/$Expected*100,3);p50=[math]::Round((Get-Percentile $values .5),3);p95=[math]::Round((Get-Percentile $values .95),3);p99=[math]::Round((Get-Percentile $values .99),3);mean=[math]::Round($mean,3);min=[math]::Round($values[0],3);max=[math]::Round($values[-1],3);standardDeviation=[math]::Round([math]::Sqrt($variance),3)}
}

foreach ($target in $targets) {
  $topology = Invoke-RestMethod -Uri "$($target.BaseUrl)/api/topology" -TimeoutSec 20
  if ($topology.mode -ne 'AWS_REAL' -or $topology.aws.status -ne 'CONNECTED' -or -not $topology.aws.availabilityZone) { throw "$($target.Name) does not provide verified AWS_REAL topology." }
  $topologies += [ordered]@{scenario=$target.Name;endpoint=$target.BaseUrl;topology=$topology}
  foreach ($n in @(1,5,10,20)) {
    $endpoint = "$($target.BaseUrl)/api/benchmark/db?n=$n"
    for ($warm=1; $warm -le $Warmups; $warm++) {
      $watch=[Diagnostics.Stopwatch]::StartNew(); try{$response=Invoke-WebRequest -Uri $endpoint -UseBasicParsing -TimeoutSec 30;$ok=[int]$response.StatusCode -eq 200}catch{$ok=$false};$watch.Stop()
      $warmupRecords += [ordered]@{timestamp=(Get-Date).ToUniversalTime().ToString('o');scenario=$target.Name;queryCount=$n;warmup=$warm;ok=$ok;clientElapsedMs=[math]::Round($watch.Elapsed.TotalMilliseconds,3)}
      if (-not $ok) { throw "Warm-up failed for $($target.Name), n=$n." }
    }
    for ($sample=1; $sample -le $Samples; $sample++) {
      $timestamp=(Get-Date).ToUniversalTime().ToString('o');$watch=[Diagnostics.Stopwatch]::StartNew()
      try {
        $response=Invoke-WebRequest -Uri $endpoint -UseBasicParsing -TimeoutSec 30;$watch.Stop();$body=$response.Content|ConvertFrom-Json;$status=[int]$response.StatusCode
        $raw += [ordered]@{timestamp=$timestamp;completedAt=(Get-Date).ToUniversalTime().ToString('o');runId=$runId;mode='AWS_REAL';scenario=$target.Name;origin=$Origin;endpoint=$endpoint;workload="GET sequential SQL benchmark n=$n";queryCount=$n;sample=$sample;status=$status;ok=($status -eq 200);error=$null;requestId=[string]$response.Headers['X-Request-Id'];clientElapsedMs=[math]::Round($watch.Elapsed.TotalMilliseconds,3);serverAppMs=[double]$body.appDurationMs;serverDbMs=[double]$body.dbDurationMs;dbQueries=$body.queries}
      } catch {
        $watch.Stop();$raw += [ordered]@{timestamp=$timestamp;completedAt=(Get-Date).ToUniversalTime().ToString('o');runId=$runId;mode='AWS_REAL';scenario=$target.Name;origin=$Origin;endpoint=$endpoint;workload="GET sequential SQL benchmark n=$n";queryCount=$n;sample=$sample;status=0;ok=$false;error=$_.Exception.Message;requestId=$null;clientElapsedMs=[math]::Round($watch.Elapsed.TotalMilliseconds,3);serverAppMs=$null;serverDbMs=$null;dbQueries=@()}
      }
    }
    $group=@($raw|Where-Object{$_.scenario -eq $target.Name -and $_.queryCount -eq $n});$stats=Get-Statistics $group $Samples
    $summaries += [ordered]@{scenario=$target.Name;queryCount=$n;samplesRequested=$Samples;warmupsExcluded=$Warmups;metrics=$stats}
    Write-Output "$($target.Name) n=$n count=$($stats.count) errors=$($stats.errors) p50=$($stats.p50)ms p95=$($stats.p95)ms p99=$($stats.p99)ms"
  }
}
$failed=@($summaries|Where-Object{$_.metrics.errors -gt 0}).Count -gt 0
$configurationLimitation = if ($Profile -eq 'CostMinimal') { 'Singapore and Hanoi use different EC2 types; co-located API/database contention means this is not a controlled location-only comparison.' } else { 'Singapore RDS and Hanoi self-managed PostgreSQL are different database configurations; this is not a geography-only comparison.' }
$document=[ordered]@{schemaVersion=1;runId=$runId;status=if($failed){'FAILED'}else{'SUCCEEDED'};mode='AWS_REAL';profile=$Profile;provenance='Measured HTTP requests to Terraform outputs; topology returned AWS_REAL identity. Validate independently against AWS APIs.';startedAt=$startedAt;completedAt=(Get-Date).ToUniversalTime().ToString('o');configuration=[ordered]@{samplesPerGroup=$Samples;warmupsPerGroup=$Warmups;queryCounts=@(1,5,10,20);concurrency=1;origin=$Origin};topologies=$topologies;summaries=$summaries;warmups=$warmupRecords;rawSamples=$raw;limitations=@($configurationLimitation,'Client origin, ISP, routing, TLS state, instance load, and dataset cache affect results.','HTTP latency variation is not packet-network jitter.')}
$timestamp=Get-Date -Format 'yyyyMMdd-HHmmss';$path=Join-Path $root "evidence\aws-real-benchmark-$timestamp-$runId.json";$latest=Join-Path $root 'evidence\aws-real-benchmark-live-latest.json';$json=$document|ConvertTo-Json -Depth 12;$json|Set-Content -LiteralPath $path -Encoding utf8;$json|Set-Content -LiteralPath $latest -Encoding utf8
Write-Output "Evidence: $path"
if ($failed) { throw 'One or more measured AWS_REAL requests failed.' }
