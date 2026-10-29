[CmdletBinding()]
param(
    [ValidateSet('HanoiRuntime', 'HanoiVerify', 'SingaporeHybrid')]
    [string]$Phase,
    [string]$Profile = 'thangvn',
    [switch]$Execute,
    [switch]$AllowSchemaInitialization
)

$ErrorActionPreference = 'Stop'
$region = 'ap-southeast-1'
$expectedAccount = '384511757667'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..\..')).Path
$evidenceDir = Join-Path $repoRoot 'evidence\aws-repair'
$phaseConfig = @{
    HanoiRuntime = @{
        InstanceId = 'i-07a5107d21ec5654e'
        Script = Join-Path $PSScriptRoot 'hanoi-runtime-repair.sh'
        Mutating = $true
    }
    HanoiVerify = @{
        InstanceId = 'i-07a5107d21ec5654e'
        Script = Join-Path $PSScriptRoot 'verify-hanoi-readiness.sh'
        Mutating = $false
    }
    SingaporeHybrid = @{
        InstanceId = 'i-0cf960f74e80cde33'
        Script = Join-Path $PSScriptRoot 'singapore-hybrid-repair.sh'
        Mutating = $true
    }
}
$config = $phaseConfig[$Phase]

if ($Execute -and $Phase -eq 'HanoiRuntime' -and -not $AllowSchemaInitialization) {
    throw 'HanoiRuntime requires -AllowSchemaInitialization because the empty Hanoi database needs the reviewed synthetic-demo schema. Obtain explicit migration/schema approval first.'
}

function Invoke-AwsJson {
    param([Parameter(Mandatory)][string[]]$Arguments)
    $raw = & aws @Arguments --profile $Profile --region $region --output json
    if ($LASTEXITCODE -ne 0) { throw "AWS CLI failed: aws $($Arguments -join ' ')" }
    return $raw | ConvertFrom-Json
}

$identity = Invoke-AwsJson -Arguments @('sts', 'get-caller-identity')
if ($identity.Account -ne $expectedAccount) { throw "AWS account mismatch: $($identity.Account)" }
$instance = Invoke-AwsJson -Arguments @(
    'ec2', 'describe-instances', '--instance-ids', $config.InstanceId,
    '--query', 'Reservations[0].Instances[0].{Id:InstanceId,State:State.Name,AZ:Placement.AvailabilityZone,Project:Tags[?Key==`Project`]|[0].Value,Environment:Tags[?Key==`Environment`]|[0].Value}'
)
if ($instance.Id -ne $config.InstanceId -or $instance.State -ne 'running') { throw 'Exact target is missing or not running.' }
if ($instance.Project -ne 'hanoi-lz-live-demo' -or $instance.Environment -ne 'cost_minimal') { throw 'Target tags do not match the demo project scope.' }
$ssm = Invoke-AwsJson -Arguments @(
    'ssm', 'describe-instance-information', '--filters', "Key=InstanceIds,Values=$($config.InstanceId)",
    '--query', 'InstanceInformationList[0].{Id:InstanceId,Ping:PingStatus,Agent:AgentVersion}'
)
if ($ssm.Id -ne $config.InstanceId -or $ssm.Ping -ne 'Online') { throw 'Exact target is not SSM Online.' }

$secretMetadata = Invoke-AwsJson -Arguments @(
    'secretsmanager', 'describe-secret', '--secret-id', 'hanoi-lz-cost-minimal-han-db-87f6505351d3b3533574437a86',
    '--query', '{Name:Name,Versions:VersionIdsToStages}'
)
$secretVersionCount = if ($null -eq $secretMetadata.Versions) { 0 } else { @($secretMetadata.Versions.PSObject.Properties).Count }
$publishSecret = if ($secretVersionCount -eq 0) { '1' } else { '0' }
$scriptHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $config.Script).Hash.ToLowerInvariant()
$ssmComment = "Phase2B5 $Phase $($scriptHash.Substring(0, 16))"
if ($ssmComment.Length -gt 100) { throw "SSM Comment exceeds the AWS 100-character limit: $($ssmComment.Length)" }
$preview = [ordered]@{
    Mode = if ($Execute) { 'EXECUTE' } else { 'PREVIEW_ONLY' }
    Phase = $Phase
    Mutating = $config.Mutating
    Account = $identity.Account
    Region = $region
    TargetInstanceId = $config.InstanceId
    TargetAvailabilityZone = $instance.AZ
    SsmPing = $ssm.Ping
    ScriptPath = $config.Script
    ScriptSha256 = $scriptHash
    HanoiSecretVersionCount = $secretVersionCount
    PublishesHanoiSecret = ($Phase -eq 'HanoiRuntime' -and $publishSecret -eq '1')
    InitializesSyntheticSchema = ($Phase -eq 'HanoiRuntime')
}
$preview | ConvertTo-Json -Depth 5

if (-not $Execute) {
    Write-Host 'PREVIEW ONLY: no SSM command was created. A separate explicit approval is required.'
    return
}

$scriptBytes = [System.IO.File]::ReadAllBytes($config.Script)
$encodedScript = [Convert]::ToBase64String($scriptBytes)
$remotePath = "/tmp/hanoi-lab-$($Phase.ToLowerInvariant())-$scriptHash.sh"
$prefix = if ($Phase -eq 'HanoiRuntime') {
    "env ALLOW_SCHEMA_INITIALIZATION=1 PUBLISH_SECRET=$publishSecret "
} else { '' }
$remoteCommand = "printf '%s' '$encodedScript' | base64 -d > '$remotePath'; chmod 0700 '$remotePath'; sudo $prefix bash '$remotePath'; rc=`$?; rm -f '$remotePath'; exit `$rc"
$parametersFile = Join-Path ([System.IO.Path]::GetTempPath()) "hanoi-repair-$([guid]::NewGuid().ToString('N')).json"
try {
    $parametersJson = @{ commands = @($remoteCommand) } | ConvertTo-Json -Compress
    [System.IO.File]::WriteAllText($parametersFile, $parametersJson, (New-Object System.Text.UTF8Encoding($false)))
    $result = Invoke-AwsJson -Arguments @(
        'ssm', 'send-command', '--document-name', 'AWS-RunShellScript',
        '--instance-ids', $config.InstanceId,
        '--comment', $ssmComment,
        '--parameters', "file://$parametersFile",
        '--timeout-seconds', '1800',
        '--query', 'Command.{CommandId:CommandId,RequestedDateTime:RequestedDateTime,Status:Status}'
    )
} finally {
    Remove-Item -LiteralPath $parametersFile -Force -ErrorAction SilentlyContinue
}

$deadline = (Get-Date).AddMinutes(30)
do {
    Start-Sleep -Seconds 5
    $invocation = Invoke-AwsJson -Arguments @(
        'ssm', 'get-command-invocation', '--command-id', $result.CommandId, '--instance-id', $config.InstanceId,
        '--query', '{CommandId:CommandId,Status:Status,ResponseCode:ResponseCode,ExecutionStartDateTime:ExecutionStartDateTime,ExecutionEndDateTime:ExecutionEndDateTime,StandardOutputContent:StandardOutputContent,StandardErrorContent:StandardErrorContent}'
    )
    if ((Get-Date) -gt $deadline) { throw "Timed out waiting for SSM command $($result.CommandId)" }
} while ($invocation.Status -in @('Pending', 'InProgress', 'Delayed'))

function Remove-SensitiveLines([string]$Text) {
    if ([string]::IsNullOrEmpty($Text)) { return '' }
    return (($Text -split "`r?`n") | ForEach-Object {
        if ($_ -match '(?i)(password|database_url|secretstring|postgres://)') { '[REDACTED SENSITIVE LINE]' } else { $_ }
    }) -join "`n"
}
$record = [ordered]@{
    SchemaVersion = 1
    RecordedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    Phase = $Phase
    Account = $identity.Account
    Region = $region
    InstanceId = $config.InstanceId
    ScriptSha256 = $scriptHash
    CommandId = $result.CommandId
    Status = $invocation.Status
    ResponseCode = $invocation.ResponseCode
    StartedAt = $invocation.ExecutionStartDateTime
    FinishedAt = $invocation.ExecutionEndDateTime
    SanitizedStdout = Remove-SensitiveLines $invocation.StandardOutputContent
    SanitizedStderr = Remove-SensitiveLines $invocation.StandardErrorContent
}
New-Item -ItemType Directory -Path $evidenceDir -Force | Out-Null
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
$evidencePath = Join-Path $evidenceDir "$timestamp-$($Phase.ToLowerInvariant())-$($result.CommandId).json"
[System.IO.File]::WriteAllText($evidencePath, ($record | ConvertTo-Json -Depth 5), (New-Object System.Text.UTF8Encoding($false)))
$record | ConvertTo-Json -Depth 5
Write-Host "Sanitized evidence: $evidencePath"
if ($invocation.Status -ne 'Success' -or [int]$invocation.ResponseCode -ne 0) { throw "SSM phase failed. CommandId=$($result.CommandId)" }
