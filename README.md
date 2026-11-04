# AWS Hanoi Local Zone Live Lab

> Current AWS state: **NOT_DEPLOYED**. The previous `cost_minimal` environment was destroyed successfully. Retained AWS_REAL benchmark evidence is historical and is never presented as a current environment.

The dashboard is a route-based educational portal: `/`, `/learn`, `/scenarios`, `/setup`, `/infra`, `/benchmarks`, `/operations`, and the interactive end-to-end workspace at `/demo`.

Start with [QUICKSTART.md](QUICKSTART.md):

For continuation in a fresh Codex session, read [CODEX_HANDOFF.md](CODEX_HANDOFF.md) before changing lifecycle or Terraform behavior.

```powershell
npm ci
.\lab.ps1 doctor
.\lab.ps1 local -Build
```

A real, auditable three-tier demo for **AWS Hanoi Local Zone for Vietnam Workloads: Architecture, Data Residency & Trade-offs**.

Phase 0 and Phase 1 provide the portable React + Node.js + PostgreSQL application and interactive lab workspace. Phase 2A adds a no-cloud-charge local network emulation workflow. Phase 2B contains three reviewed Terraform profiles: `smoke_hanoi`, default `cost_minimal`, and optional `full_managed`. The previously verified AWS deployment was destroyed; the active deployment state now contains zero resources.

## AWS plan review

```powershell
.\lab.ps1 artifacts
.\lab.ps1 plan -Profile <profile> -PresenterCidr '<YOUR_PUBLIC_IPV4>/32'
.\lab.ps1 review
```

These commands default to the two-location cost-minimal profile and generate a plan only. Read the [cost-minimal review](docs/PHASE_2B2_COST_MINIMAL_REVIEW.md), [deployment runbook](docs/AWS_REAL_DEPLOYMENT_RUNBOOK.md), [cost estimate](docs/AWS_REAL_COST_ESTIMATE.md), and [teardown runbook](docs/AWS_REAL_TEARDOWN_RUNBOOK.md) before considering an apply.

## Local network emulation quick start

Requirements: Docker Desktop with Compose v2 and PowerShell 7 or Windows PowerShell 5.1.

```powershell
Copy-Item .env.example .env
Copy-Item .env.emulation.example .env.emulation
.\scripts\emulation\start.ps1 -Build
```

Open:

- Order application: <http://localhost:8081>
- Interactive portal: <http://localhost:3000>
- Singapore-shaped API: <http://127.0.0.1:8101>
- Hanoi-shaped API: <http://127.0.0.1:8102>
- Hybrid Singapore-app/Hanoi-database-shaped API: <http://127.0.0.1:8103>

The delays in `.env.emulation` are illustrative operator inputs. Results come from actual HTTP and PostgreSQL work through Toxiproxy, but they are **not actual or predicted AWS Singapore/Hanoi Local Zone performance**.

## Five local scenarios

```powershell
# Readiness preflight and full local rehearsal
.\scripts\emulation\presenter.ps1 -Scenario Preflight
.\scripts\emulation\presenter.ps1 -Scenario All -Samples 100 -Warmups 5

# Cases 1–3: shaped HTTP/DB benchmarks; JSON evidence is generated locally
.\scripts\emulation\verify-scenarios.ps1 -Scenario All -Samples 100 -Warmups 5

# Case 4: actual local pg_dump/pg_restore, checksum, and cutover-write drill
.\scripts\emulation\migrate-sg-to-hanoi.ps1

# Case 5: actual local logical backup/isolated restore verification
.\scripts\emulation\backup-restore.ps1
```

The dashboard **Scenarios** view follows the launcher's actual streamed log and exposes benchmark, migration, and recovery evidence. The localhost agent exposes fixed AWS lifecycle actions for preflight, saved-plan creation/review, bootstrap readiness and residual inventory. An exact saved-plan apply/destroy executor is implemented and fake-tested, but the normal startup deliberately does not inject it, so real mutation remains disabled until a separately authorized rehearsal. See [the presenter runbook](docs/PRESENTER_RUNBOOK.md), [benchmark methodology](docs/BENCHMARK_METHODOLOGY.md), [rehearsal guide](docs/LIVE_DEMO_REHEARSAL.md), and [AWS authentication recovery](docs/AWS_AUTH_RECOVERY.md).

Stop without deleting volumes:

```powershell
docker compose -f docker-compose.yml -f docker-compose.emulation.yml down
```

## Developer verification

```powershell
npm ci
npm test
npm run typecheck
npm run build
docker compose -f docker-compose.yml -f docker-compose.emulation.yml config --quiet
```

See [the access-limitation fallback](docs/ACCESS_LIMITATION_FALLBACK.md), [local runbook](docs/DEMO_RUNBOOK.md), [architecture](docs/ARCHITECTURE.md), [AWS verification checklist](docs/AWS_VERIFICATION.md), and [implementation plan](IMPLEMENTATION_PLAN.md).

## Safety boundary

AWS diagnostics and the local agent are read-only. `terraform apply` remains forbidden until the operator explicitly approves the exact saved plan and cost window. PostgreSQL is never public in the AWS plan or published to a host port locally. Use synthetic `DEMO-*` order references only.
