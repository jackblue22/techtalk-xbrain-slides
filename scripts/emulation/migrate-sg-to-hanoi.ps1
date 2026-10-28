param([switch]$SkipStart)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$compose = @('compose', '-f', (Join-Path $root 'docker-compose.yml'), '-f', (Join-Path $root 'docker-compose.emulation.yml'))
$evidencePath = Join-Path $root 'evidence\local-emulation-migration.json'
$startedAt = (Get-Date).ToUniversalTime().ToString('o')
$archiveName = 'migration-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString() + '.json'
$archivePath = Join-Path $root (Join-Path 'evidence' $archiveName)
$checksumSql = "select md5(coalesce(string_agg(id::text || '|' || public_id::text || '|' || customer_ref || '|' || status || '|' || total::text, E'\n' order by id), '')) from orders;"

function Invoke-Compose([string[]]$Arguments) {
  $oldPreference=$ErrorActionPreference;$ErrorActionPreference='Continue';$output=@(& docker @compose @Arguments 2>&1);$exit=$LASTEXITCODE;$ErrorActionPreference=$oldPreference
  $output|ForEach-Object{Write-Output ([string]$_)}
  if ($exit -ne 0) { throw "Docker Compose command failed: $($Arguments -join ' ')" }
}
function Read-Scalar([string]$Service, [string]$Sql) {
  $oldPreference=$ErrorActionPreference;$ErrorActionPreference='Continue';$value=@(& docker @compose exec -T $Service psql -U hanoi_app -d hanoi_lab -Atc $Sql 2>&1);$exit=$LASTEXITCODE;$ErrorActionPreference=$oldPreference
  if ($exit -ne 0) { throw "SQL failed on ${Service}: $($value -join ' ')" }
  return ([string]$value).Trim()
}
function Write-Evidence($Document) {
  $json = $Document | ConvertTo-Json -Depth 5
  $json | Set-Content -LiteralPath $evidencePath -Encoding utf8
  $json | Set-Content -LiteralPath $archivePath -Encoding utf8
}

if (-not $SkipStart) { & (Join-Path $PSScriptRoot 'start.ps1') | Write-Output }
$total = [System.Diagnostics.Stopwatch]::StartNew()
$downtime = [System.Diagnostics.Stopwatch]::StartNew()
$servicesStopped = $false
try {
  Invoke-Compose @('stop', 'sg-api', 'han-api', 'hybrid-api')
  $servicesStopped = $true
  $sourceCount = [int](Read-Scalar 'sg-db' 'select count(*) from orders;')
  $sourceChecksum = Read-Scalar 'sg-db' $checksumSql

  Invoke-Compose @('exec', '-T', 'sg-db', 'pg_dump', '-U', 'hanoi_app', '-d', 'hanoi_lab', '-Fc', '--no-owner', '--no-privileges', '-f', '/evidence/sg-migration.dump')
  Invoke-Compose @('exec', '-T', 'han-db', 'psql', '-U', 'hanoi_app', '-d', 'hanoi_lab', '-v', 'ON_ERROR_STOP=1', '-c', 'drop schema public cascade; create schema public; grant all on schema public to hanoi_app;')
  Invoke-Compose @('exec', '-T', 'han-db', 'pg_restore', '-U', 'hanoi_app', '-d', 'hanoi_lab', '--exit-on-error', '--no-owner', '--no-privileges', '/evidence/sg-migration.dump')

  $targetCountBeforeWrite = [int](Read-Scalar 'han-db' 'select count(*) from orders;')
  $targetChecksum = Read-Scalar 'han-db' $checksumSql
  if ($sourceCount -ne $targetCountBeforeWrite -or $sourceChecksum -ne $targetChecksum) { throw 'Migration validation failed: count or checksum mismatch.' }

  Invoke-Compose @('start', 'sg-api', 'han-api', 'hybrid-api')
  $servicesStopped = $false
  for ($attempt = 1; $attempt -le 30; $attempt += 1) {
    try { if ((Invoke-RestMethod 'http://127.0.0.1:8103/health' -TimeoutSec 5).status -eq 'ok') { break } } catch { Start-Sleep -Seconds 1 }
    if ($attempt -eq 30) { throw 'Hybrid API did not recover after migration.' }
  }
  $downtime.Stop()

  $customerRef = 'DEMO-CUTOVER-' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
  $payload = @{ customerRef = $customerRef; items = @(@{ sku = 'POST-CUTOVER'; quantity = 1; unitPrice = 1.00 }) } | ConvertTo-Json -Depth 4
  $write = Invoke-WebRequest -Uri 'http://127.0.0.1:8103/api/orders' -Method Post -ContentType 'application/json' -Body $payload -UseBasicParsing
  $targetPresence = [int](Read-Scalar 'han-db' "select count(*) from orders where customer_ref = '$customerRef';")
  $sourcePresence = [int](Read-Scalar 'sg-db' "select count(*) from orders where customer_ref = '$customerRef';")
  if ($targetPresence -ne 1 -or $sourcePresence -ne 0) { throw 'Post-cutover write verification failed.' }

  $total.Stop()
  $evidence = [ordered]@{
    status = 'SUCCEEDED'
    mode = 'LOCAL_NETWORK_EMULATION'
    scenario = 'CASE_4_SG_TO_HANOI_MIGRATION_EMULATED'
    measuredAt = (Get-Date).ToUniversalTime().ToString('o')
    source = 'sg-db Docker PostgreSQL'
    target = 'han-db Docker PostgreSQL'
    artifact = 'pg_dump custom-format file in a local Docker volume'
    sourceCount = $sourceCount
    targetCountBeforePostCutoverWrite = $targetCountBeforeWrite
    sourceChecksum = $sourceChecksum
    targetChecksum = $targetChecksum
    contentChecksumMatched = ($sourceChecksum -eq $targetChecksum)
    postCutoverCustomerRef = $customerRef
    postCutoverTargetPresence = $targetPresence
    postCutoverSourcePresence = $sourcePresence
    postCutoverRequestId = [string]$write.Headers['X-Request-Id']
    measuredWriteDowntimeMs = $downtime.ElapsedMilliseconds
    totalWorkflowMs = $total.ElapsedMilliseconds
    commandExitStatus = 0
    evidenceFile = "evidence/$archiveName"
    verification = [ordered]@{ rowCountsMatched=($sourceCount -eq $targetCountBeforeWrite); checksumsMatched=($sourceChecksum -eq $targetChecksum); sampleRecordOnTarget=($targetPresence -eq 1); sampleRecordAbsentFromSource=($sourcePresence -eq 0) }
    limitation = 'Local Docker migration only. It does not measure AWS transfer, downtime, RPO, RTO, or Hanoi Local Zone performance.'
  }
  Write-Evidence $evidence
  $evidence | ConvertTo-Json -Depth 5
} catch {
  $total.Stop()
  $failure = [ordered]@{ status='FAILED'; mode='LOCAL_NETWORK_EMULATION'; scenario='CASE_4_SG_TO_HANOI_MIGRATION_EMULATED'; startedAt=$startedAt; failedAt=(Get-Date).ToUniversalTime().ToString('o'); commandExitStatus=1; error=$_.Exception.Message; evidenceFile="evidence/$archiveName"; limitation='Failed local workflow; no AWS result or successful migration may be inferred.' }
  Write-Evidence $failure
  throw
} finally {
  if ($servicesStopped) { Invoke-Compose @('start','sg-api','han-api','hybrid-api') | Out-Null }
}
