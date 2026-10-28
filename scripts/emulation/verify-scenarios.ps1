param(
  [ValidateSet('All','Case1','Case2','Case3')][string]$Scenario='All',
  [ValidateRange(1,300)][int]$Samples=100,
  [ValidateRange(0,50)][int]$Warmups=5
)
$ErrorActionPreference='Stop'
$root=Resolve-Path (Join-Path $PSScriptRoot '..\..')
$runId=[guid]::NewGuid().ToString()
$startedAt=(Get-Date).ToUniversalTime().ToString('o')
$targets=@(
  @{Case='Case1';Scenario='CASE_1_FULL_SINGAPORE_EMULATED';BaseUrl='http://127.0.0.1:8101';Proxy='sg_http'},
  @{Case='Case2';Scenario='CASE_2_FULL_HANOI_EMULATED';BaseUrl='http://127.0.0.1:8102';Proxy='han_http'},
  @{Case='Case3';Scenario='CASE_3_SG_APP_HANOI_DB_EMULATED';BaseUrl='http://127.0.0.1:8103';Proxy='hybrid_http'}
)
if($Scenario -ne 'All'){$targets=@($targets|Where-Object{$_.Case -eq $Scenario})}
$raw=@();$warmupRecords=@();$summaries=@();$delayVerification=@()

function Get-Percentile([double[]]$Sorted,[double]$P){ if($Sorted.Count -eq 0){return $null};$rank=($Sorted.Count-1)*$P;$low=[math]::Floor($rank);$high=[math]::Ceiling($rank);$weight=$rank-$low;return $Sorted[$low]*(1-$weight)+$Sorted[$high]*$weight }
function Get-Statistics($Group,[int]$Expected){
  $success=@($Group|Where-Object{$_.ok});$values=@($success.clientElapsedMs|Sort-Object);$errors=$Expected-$success.Count
  if($values.Count -eq 0){return [ordered]@{count=0;errors=$errors;errorRate=100;p50=$null;p95=$null;p99=$null;mean=$null;min=$null;max=$null;standardDeviation=$null}}
  $mean=($values|Measure-Object -Average).Average;$variance=($values|ForEach-Object{($_-$mean)*($_-$mean)}|Measure-Object -Average).Average
  return [ordered]@{count=$values.Count;errors=$errors;errorRate=[math]::Round($errors/$Expected*100,3);p50=[math]::Round((Get-Percentile $values .50),3);p95=[math]::Round((Get-Percentile $values .95),3);p99=[math]::Round((Get-Percentile $values .99),3);mean=[math]::Round($mean,3);min=[math]::Round($values[0],3);max=[math]::Round($values[-1],3);standardDeviation=[math]::Round([math]::Sqrt($variance),3)}
}

foreach($target in $targets){
  $topology=Invoke-RestMethod -Uri ($target.BaseUrl+'/api/topology') -TimeoutSec 10
  if($topology.mode -ne 'LOCAL_NETWORK_EMULATION' -or -not $topology.networkEmulation.enabled){throw "$($target.Case) topology is not explicitly emulated."}
  $compose=@('compose','-f',(Join-Path $root 'docker-compose.yml'),'-f',(Join-Path $root 'docker-compose.emulation.yml'))
  $inspection=(& docker @compose exec -T toxiproxy /toxiproxy-cli inspect $target.Proxy 2>&1)-join "`n"
  $expectedDelay=[int]$topology.networkEmulation.httpOneWayDelayMs
  $delayApplied=$LASTEXITCODE -eq 0 -and $inspection -match "latency=$expectedDelay" -and $inspection -match 'stream=upstream' -and $inspection -match 'stream=downstream'
  $delayVerification += [ordered]@{scenario=$target.Scenario;proxy=$target.Proxy;configuredOneWayMs=$expectedDelay;upstreamAndDownstreamApplied=$delayApplied;parameterClass='OPERATOR_DEFINED_ILLUSTRATIVE'}
  if(-not $delayApplied){throw "Configured delay verification failed for $($target.Proxy)."}
  foreach($n in @(1,5,10,20)){
    $path="/api/benchmark/db?n=$n";$endpoint=$target.BaseUrl+$path
    for($warm=1;$warm -le $Warmups;$warm++){
      $watch=[Diagnostics.Stopwatch]::StartNew();try{$response=Invoke-WebRequest -Uri $endpoint -UseBasicParsing -TimeoutSec 30;$status=[int]$response.StatusCode;$ok=$status -ge 200 -and $status -lt 300}catch{$status=0;$ok=$false};$watch.Stop()
      $warmupRecords += [ordered]@{timestamp=(Get-Date).ToUniversalTime().ToString('o');scenario=$target.Scenario;queryCount=$n;warmup=$warm;status=$status;ok=$ok;clientElapsedMs=[math]::Round($watch.Elapsed.TotalMilliseconds,3)}
      if(-not $ok){throw "Warm-up failed for $($target.Scenario), n=$n."}
    }
    for($sample=1;$sample -le $Samples;$sample++){
      $timestamp=(Get-Date).ToUniversalTime().ToString('o');$watch=[Diagnostics.Stopwatch]::StartNew();$record=$null
      try{
        $response=Invoke-WebRequest -Uri $endpoint -UseBasicParsing -TimeoutSec 30;$watch.Stop();$body=$response.Content|ConvertFrom-Json;$status=[int]$response.StatusCode;$ok=$status -ge 200 -and $status -lt 300
        $record=[ordered]@{timestamp=$timestamp;completedAt=(Get-Date).ToUniversalTime().ToString('o');runId=$runId;mode='LOCAL_NETWORK_EMULATION';scenario=$target.Scenario;origin='presenter-host-loopback';endpoint=$endpoint;workload="GET sequential SQL benchmark n=$n";delayProfile=[ordered]@{classification='OPERATOR_DEFINED_ILLUSTRATIVE';httpOneWayMs=$topology.networkEmulation.httpOneWayDelayMs;databaseOneWayMs=$topology.networkEmulation.databaseOneWayDelayMs};queryCount=$n;sample=$sample;status=$status;ok=$ok;error=$null;requestId=[string]$response.Headers['X-Request-Id'];clientElapsedMs=[math]::Round($watch.Elapsed.TotalMilliseconds,3);serverAppMs=[double]$body.appDurationMs;serverDbMs=[double]$body.dbDurationMs;dbQueries=$body.queries}
      }catch{
        $watch.Stop();$record=[ordered]@{timestamp=$timestamp;completedAt=(Get-Date).ToUniversalTime().ToString('o');runId=$runId;mode='LOCAL_NETWORK_EMULATION';scenario=$target.Scenario;origin='presenter-host-loopback';endpoint=$endpoint;workload="GET sequential SQL benchmark n=$n";delayProfile=[ordered]@{classification='OPERATOR_DEFINED_ILLUSTRATIVE';httpOneWayMs=$topology.networkEmulation.httpOneWayDelayMs;databaseOneWayMs=$topology.networkEmulation.databaseOneWayDelayMs};queryCount=$n;sample=$sample;status=0;ok=$false;error=$_.Exception.Message;requestId=$null;clientElapsedMs=[math]::Round($watch.Elapsed.TotalMilliseconds,3);serverAppMs=$null;serverDbMs=$null;dbQueries=@()}
      }
      $raw += $record
    }
    $group=@($raw|Where-Object{$_.scenario -eq $target.Scenario -and $_.queryCount -eq $n});$stats=Get-Statistics $group $Samples
    $summaries += [ordered]@{scenario=$target.Scenario;queryCount=$n;samplesRequested=$Samples;warmupsExcluded=$Warmups;metrics=$stats}
    Write-Output ("{0} n={1}: samples={2} errors={3} p50={4}ms p95={5}ms p99={6}ms mean={7}ms stddev={8}ms" -f $target.Scenario,$n,$stats.count,$stats.errors,$stats.p50,$stats.p95,$stats.p99,$stats.mean,$stats.standardDeviation)
  }
}
$failed=@($summaries|Where-Object{$_.metrics.errors -gt 0}).Count -gt 0
$completedAt=(Get-Date).ToUniversalTime().ToString('o')
$document=[ordered]@{schemaVersion=2;runId=$runId;status=if($failed){'FAILED'}else{'SUCCEEDED'};mode='LOCAL_NETWORK_EMULATION';provenance='Actual HTTP and PostgreSQL timings through operator-configured Toxiproxy. Not AWS performance.';startedAt=$startedAt;completedAt=$completedAt;configuration=[ordered]@{scenarioSelection=$Scenario;samplesPerGroup=$Samples;warmupsPerGroup=$Warmups;queryCounts=@(1,5,10,20);concurrency=1;requestOrder='scenario, query count, sequential sample';reproducibility='fixed workload and ordering; host scheduling noise remains'};delayVerification=$delayVerification;summaries=$summaries;warmups=$warmupRecords;rawSamples=$raw;limitations=@('Operator-defined illustrative delay, not measured or predicted AWS latency.','Different compute/database configurations are not geography-only comparisons.','Local host scheduling, Docker networking, and proxy overhead affect results.')}
$timestamp=Get-Date -Format 'yyyyMMdd-HHmmss';$runPath=Join-Path $root "evidence\benchmark-$timestamp-$runId.json";$latestPath=Join-Path $root 'evidence\benchmark-latest.json'
$json=$document|ConvertTo-Json -Depth 12;$json|Set-Content -LiteralPath $runPath -Encoding utf8
$existingSamples=0
if(Test-Path -LiteralPath $latestPath){try{$existingSamples=[int]((Get-Content -Raw $latestPath|ConvertFrom-Json).configuration.samplesPerGroup)}catch{$existingSamples=0}}
if($failed -or $Samples -ge $existingSamples){$json|Set-Content -LiteralPath $latestPath -Encoding utf8;Write-Output "Latest evidence updated: $latestPath"}else{Write-Output "Latest evidence retained at $existingSamples samples/group: $latestPath"}
Write-Output "Raw evidence: $runPath"
if($failed){throw 'One or more measured requests failed. Evidence status is FAILED.'}
