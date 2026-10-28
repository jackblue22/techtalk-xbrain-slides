param([switch]$SkipStart)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$compose = @('compose', '-f', (Join-Path $root 'docker-compose.yml'), '-f', (Join-Path $root 'docker-compose.emulation.yml'))
$evidencePath = Join-Path $root 'evidence\local-emulation-backup-restore.json'
$startedAt = (Get-Date).ToUniversalTime().ToString('o')
$archiveName = 'backup-restore-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString() + '.json'
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
try {
$timer = [System.Diagnostics.Stopwatch]::StartNew()
$customerRef = 'DEMO-RECOVERY-' + [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$payload = @{ customerRef = $customerRef; items = @(@{ sku = 'RECOVERY-PROBE'; quantity = 1; unitPrice = 7.00 }) } | ConvertTo-Json -Depth 4
$write = Invoke-WebRequest -Uri 'http://127.0.0.1:8102/api/orders' -Method Post -ContentType 'application/json' -Body $payload -UseBasicParsing
$sourceCount = [int](Read-Scalar 'han-db' 'select count(*) from orders;')
$sourceChecksum = Read-Scalar 'han-db' $checksumSql

Invoke-Compose @('exec', '-T', 'han-db', 'pg_dump', '-U', 'hanoi_app', '-d', 'hanoi_lab', '-Fc', '--no-owner', '--no-privileges', '-f', '/evidence/han-logical-backup.dump')
Invoke-Compose @('exec', '-T', 'recovery-db', 'psql', '-U', 'hanoi_app', '-d', 'hanoi_lab', '-v', 'ON_ERROR_STOP=1', '-c', 'drop schema public cascade; create schema public; grant all on schema public to hanoi_app;')
Invoke-Compose @('exec', '-T', 'recovery-db', 'pg_restore', '-U', 'hanoi_app', '-d', 'hanoi_lab', '--exit-on-error', '--no-owner', '--no-privileges', '/evidence/han-logical-backup.dump')

$recoveryCount = [int](Read-Scalar 'recovery-db' 'select count(*) from orders;')
$recoveryChecksum = Read-Scalar 'recovery-db' $checksumSql
$sampleRecovered = [int](Read-Scalar 'recovery-db' "select count(*) from orders where customer_ref = '$customerRef';")
if ($sourceCount -ne $recoveryCount -or $sourceChecksum -ne $recoveryChecksum -or $sampleRecovered -ne 1) { throw 'Backup restore validation failed.' }
$timer.Stop()

$evidence = [ordered]@{
  status = 'SUCCEEDED'
  mode = 'LOCAL_NETWORK_EMULATION'
  scenario = 'CASE_5_LOGICAL_BACKUP_RESTORE_EMULATED'
  measuredAt = (Get-Date).ToUniversalTime().ToString('o')
  source = 'han-db Docker PostgreSQL'
  recoveryTarget = 'isolated recovery-db Docker PostgreSQL'
  artifactType = 'POSTGRES_CUSTOM_FORMAT_LOGICAL_BACKUP'
  isEbsSnapshot = $false
  sourceCount = $sourceCount
  recoveryCount = $recoveryCount
  sourceChecksum = $sourceChecksum
  recoveryChecksum = $recoveryChecksum
  contentChecksumMatched = ($sourceChecksum -eq $recoveryChecksum)
  sampleCustomerRef = $customerRef
  sampleRecovered = ($sampleRecovered -eq 1)
  sourceWriteRequestId = [string]$write.Headers['X-Request-Id']
  totalWorkflowMs = $timer.ElapsedMilliseconds
  commandExitStatus = 0
  evidenceFile = "evidence/$archiveName"
  verification = [ordered]@{ rowCountsMatched=($sourceCount -eq $recoveryCount); checksumsMatched=($sourceChecksum -eq $recoveryChecksum); sampleRecordRecovered=($sampleRecovered -eq 1) }
  limitation = 'This is a local logical backup in a Docker volume. It is not an EBS Local Snapshot, does not prove residency, and does not test an independent failure domain.'
}
Write-Evidence $evidence
$evidence | ConvertTo-Json -Depth 5
} catch {
  $failure = [ordered]@{ status='FAILED'; mode='LOCAL_NETWORK_EMULATION'; scenario='CASE_5_LOGICAL_BACKUP_RESTORE_EMULATED'; startedAt=$startedAt; failedAt=(Get-Date).ToUniversalTime().ToString('o'); commandExitStatus=1; error=$_.Exception.Message; isEbsSnapshot=$false; evidenceFile="evidence/$archiveName"; limitation='Failed local logical recovery workflow; no AWS snapshot or successful restore may be inferred.' }
  Write-Evidence $failure
  throw
}
