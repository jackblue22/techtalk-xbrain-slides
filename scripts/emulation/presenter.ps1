param(
  [ValidateSet('Preflight','Case1','Case2','Case3','Case4','Case5','All','Reset')][string]$Scenario='Preflight',
  [ValidateRange(1,300)][int]$Samples=100,
  [ValidateRange(0,50)][int]$Warmups=5,
  [switch]$Build,
  [switch]$ConfirmReset
)
$ErrorActionPreference='Stop'
$root=Resolve-Path (Join-Path $PSScriptRoot '..\..')
$evidenceDir=Join-Path $root 'evidence'
$logPath=Join-Path $evidenceDir 'presenter-latest.log'
$statePath=Join-Path $evidenceDir 'presenter-latest.json'
$runId=[guid]::NewGuid().ToString()
$startedAt=(Get-Date).ToUniversalTime().ToString('o')
$workflowMutex=New-Object System.Threading.Mutex($false,'HanoiLocalZonePresenterWorkflow')
$ownsWorkflowMutex=$false
try {
  $ownsWorkflowMutex=$workflowMutex.WaitOne(0)
} catch [System.Threading.AbandonedMutexException] {
  $ownsWorkflowMutex=$true
}
if(-not $ownsWorkflowMutex){
  $workflowMutex.Dispose()
  throw 'Another presenter workflow is already running. Wait for it to finish or cancel it before retrying.'
}

function Publish-State([string]$Status,[string]$Current,[string]$Message) {
  [ordered]@{runId=$runId;scenario=$Scenario;status=$Status;currentStep=$Current;message=$Message;startedAt=$startedAt;updatedAt=(Get-Date).ToUniversalTime().ToString('o');mode='LOCAL_NETWORK_EMULATION';provenance='Actual local commands and operations; network delays are operator-defined illustrative parameters.'} | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $statePath -Encoding utf8
}
function Write-Stream([string]$Message) { $line="[$((Get-Date).ToUniversalTime().ToString('HH:mm:ss.fff'))Z] $Message"; Write-Output $line; Add-Content -LiteralPath $logPath -Value $line -Encoding utf8 }
function Invoke-Step([string]$Name,[scriptblock]$Command) {
  Publish-State 'RUNNING' $Name "Executing $Name"
  Write-Stream "START $Name"
  & $Command *>&1 | ForEach-Object { Write-Stream ([string]$_) }
  if(-not $?){throw "$Name returned a failure status."}
  Write-Stream "PASS $Name"
}

try {
  Set-Content -LiteralPath $logPath -Value '' -Encoding utf8
  if($Scenario -ne 'Reset') {
    Invoke-Step 'Start and health wait' { & (Join-Path $PSScriptRoot 'start.ps1') -Build:$Build }
    Invoke-Step 'Preflight' { & (Join-Path $PSScriptRoot 'preflight.ps1') -WriteEvidence -SummaryOnly }
  }
  $requested=if($Scenario -eq 'All'){@('BenchmarkAll','Case4','Case5')}else{@($Scenario)}
  foreach($case in $requested){
    switch($case){
      'Preflight' { }
      'BenchmarkAll' { Invoke-Step 'Cases 1-3 benchmark suite' { & (Join-Path $PSScriptRoot 'verify-scenarios.ps1') -Scenario All -Samples $Samples -Warmups $Warmups } }
      'Case1' { Invoke-Step 'Case 1 Singapore-shaped benchmark' { & (Join-Path $PSScriptRoot 'verify-scenarios.ps1') -Scenario Case1 -Samples $Samples -Warmups $Warmups } }
      'Case2' { Invoke-Step 'Case 2 Hanoi-shaped benchmark' { & (Join-Path $PSScriptRoot 'verify-scenarios.ps1') -Scenario Case2 -Samples $Samples -Warmups $Warmups } }
      'Case3' { Invoke-Step 'Case 3 hybrid benchmark' { & (Join-Path $PSScriptRoot 'verify-scenarios.ps1') -Scenario Case3 -Samples $Samples -Warmups $Warmups } }
      'Case4' { Invoke-Step 'Case 4 migration and cutover verification' { & (Join-Path $PSScriptRoot 'migrate-sg-to-hanoi.ps1') -SkipStart } }
      'Case5' { Invoke-Step 'Case 5 backup and recovery verification' { & (Join-Path $PSScriptRoot 'backup-restore.ps1') -SkipStart } }
      'Reset' { if(-not $ConfirmReset){throw 'Reset requires -ConfirmReset.'}; Invoke-Step 'Reset local synthetic lab' { & (Join-Path $PSScriptRoot 'reset.ps1') -SkipStart -Confirm:$false } }
    }
  }
  Publish-State 'SUCCEEDED' 'Complete' "$Scenario completed with explicit success status."
  Write-Stream "SUCCEEDED scenario=$Scenario runId=$runId"
} catch {
  Publish-State 'FAILED' 'Failed' $_.Exception.Message
  Write-Stream "FAILED scenario=$Scenario error=$($_.Exception.Message)"
  throw
} finally {
  if($ownsWorkflowMutex){$workflowMutex.ReleaseMutex()}
  $workflowMutex.Dispose()
}
