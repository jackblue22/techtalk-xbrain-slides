[CmdletBinding(SupportsShouldProcess, ConfirmImpact='High')]
param([switch]$SkipStart)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$compose = @('compose', '-f', (Join-Path $root 'docker-compose.yml'), '-f', (Join-Path $root 'docker-compose.emulation.yml'))
if (-not $PSCmdlet.ShouldProcess('local synthetic SG, Hanoi, and recovery PostgreSQL schemas', 'Reset')) { return }
if (-not $SkipStart) { & (Join-Path $PSScriptRoot 'start.ps1') | Write-Output }
function Invoke-Compose([string[]]$Arguments) {
  $oldPreference=$ErrorActionPreference;$ErrorActionPreference='Continue';$output=@(& docker @compose @Arguments 2>&1);$exit=$LASTEXITCODE;$ErrorActionPreference=$oldPreference
  $output|ForEach-Object{Write-Output ([string]$_)}
  if($exit -ne 0){throw "Compose failed: $($Arguments -join ' ')"}
}
$resetSql='drop schema if exists public cascade; create schema public; grant all on schema public to hanoi_app;'
try {
  Invoke-Compose @('stop','sg-api','han-api','hybrid-api')
  foreach($database in @('sg-db','han-db','recovery-db')) {
    Write-Output "Resetting $database synthetic schema..."
    Invoke-Compose @('exec','-T',$database,'psql','-U','hanoi_app','-d','hanoi_lab','-v','ON_ERROR_STOP=1','-c',$resetSql)
  }
  Invoke-Compose @('start','sg-api','han-api')
  foreach($service in @('sg-api','han-api')) {
    $healthy=$false
    for($attempt=1;$attempt -le 30;$attempt++){ $state=(& docker @compose ps --format json $service | ConvertFrom-Json).Health; if($state -eq 'healthy'){$healthy=$true;break}; Start-Sleep -Seconds 1 }
    if(-not $healthy){throw "$service did not become healthy after reset."}
  }
  Invoke-Compose @('start','hybrid-api')
  Write-Output 'RESET SUCCEEDED - only local synthetic scenario schemas were reset; prior evidence was retained.'
} catch {
  Write-Error "RESET FAILED: $($_.Exception.Message)"
  throw
} finally {
  Invoke-Compose @('start','sg-api','han-api','hybrid-api') | Out-Null
}
