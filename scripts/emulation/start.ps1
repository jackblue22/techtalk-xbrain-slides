param([switch]$Build)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$compose = @('compose', '-f', (Join-Path $root 'docker-compose.yml'), '-f', (Join-Path $root 'docker-compose.emulation.yml'))
$up = @('up', '-d')
if ($Build) { $up += '--build' }
$oldPreference=$ErrorActionPreference;$ErrorActionPreference='Continue';$dockerOutput=@(& docker @compose @up 2>&1);$dockerExit=$LASTEXITCODE;$ErrorActionPreference=$oldPreference
$dockerOutput | ForEach-Object { Write-Output ([string]$_) }
if ($dockerExit -ne 0) { throw 'Docker Compose failed to start the emulation stack.' }

# emulation-init replaces proxy definitions. Restart the hybrid API so its
# PostgreSQL pool cannot retain a connection to the replaced hybrid_db proxy.
$oldPreference=$ErrorActionPreference;$ErrorActionPreference='Continue';$restartOutput=@(& docker @compose restart hybrid-api 2>&1);$restartExit=$LASTEXITCODE;$ErrorActionPreference=$oldPreference
$restartOutput | ForEach-Object { Write-Output ([string]$_) }
if($restartExit -ne 0){throw 'Hybrid API restart failed after proxy configuration.'}

$targets = @(
  @{ Name = 'SG baseline'; Url = 'http://127.0.0.1:8101/health' },
  @{ Name = 'Hanoi baseline'; Url = 'http://127.0.0.1:8102/health' },
  @{ Name = 'Hybrid SG app / Hanoi DB'; Url = 'http://127.0.0.1:8103/health' }
)
foreach ($target in $targets) {
  $ready = $false
  for ($attempt = 1; $attempt -le 30; $attempt += 1) {
    try {
      $response = Invoke-RestMethod -Uri $target.Url -TimeoutSec 5
      if ($response.status -eq 'ok') { $ready = $true; break }
    } catch { Start-Sleep -Seconds 1 }
  }
  if (-not $ready) { throw "$($target.Name) did not become ready at $($target.Url)." }
  Write-Output "$($target.Name): READY (locally emulated, not AWS)"
}
