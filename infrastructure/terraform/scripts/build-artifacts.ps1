param(
  [ValidateSet('Smoke','CostMinimal','Full','All')][string]$Target = 'CostMinimal'
)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$artifactDirectory = Join-Path $root 'infrastructure\terraform\artifacts'
New-Item -ItemType Directory -Force -Path $artifactDirectory | Out-Null

function Invoke-Docker([string[]]$Arguments) {
  & docker @Arguments
  if ($LASTEXITCODE -ne 0) { throw "docker $($Arguments -join ' ') failed with exit code $LASTEXITCODE." }
}

if ($Target -in @('Smoke','All')) {
  Invoke-Docker @('build','--pull','-t','hanoi-lab-smoke:aws','-f',(Join-Path $root 'infrastructure\terraform\bootstrap\smoke\Dockerfile'),$root)
  Invoke-Docker @('save','--output',(Join-Path $artifactDirectory 'smoke-images.tar'),'hanoi-lab-smoke:aws')
}

if ($Target -in @('Full','All')) {
  Invoke-Docker @('build','--pull','-t','hanoi-lab-backend:aws','-f',(Join-Path $root 'app\backend\Dockerfile'),$root)
  Invoke-Docker @('build','--pull','-t','hanoi-lab-frontend:aws','-f',(Join-Path $root 'app\frontend\Dockerfile'),$root)
  Invoke-Docker @('pull','postgres:16-alpine')
  Invoke-Docker @('save','--output',(Join-Path $artifactDirectory 'full-images.tar'),'hanoi-lab-backend:aws','hanoi-lab-frontend:aws','postgres:16-alpine')
}

if ($Target -in @('CostMinimal','All')) {
  Push-Location -LiteralPath $root
  try {
    & npm --workspace app/frontend run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend production build failed.' }
  } finally { Pop-Location }
  Invoke-Docker @('build','--pull','-t','hanoi-lab-backend:aws','-f',(Join-Path $root 'app\backend\Dockerfile'),$root)
  Invoke-Docker @('build','--pull','-t','hanoi-lab-frontend:aws','-f',(Join-Path $root 'app\frontend\Dockerfile'),$root)
  Invoke-Docker @('pull','postgres:16-alpine')
  Invoke-Docker @('save','--output',(Join-Path $artifactDirectory 'minimal-images.tar'),'hanoi-lab-backend:aws','hanoi-lab-frontend:aws','postgres:16-alpine')
}

Get-ChildItem -LiteralPath $artifactDirectory -File | ForEach-Object {
  [ordered]@{ file=$_.Name; bytes=$_.Length; sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant() }
} | ConvertTo-Json
