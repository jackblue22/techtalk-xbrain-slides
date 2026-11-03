# Codex Handoff — AWS Hanoi Local Zone Interactive Lab

Checkpoint date: 2026-11-03 (Asia/Saigon)

## Purpose and architecture

This repository is an interactive technical lab for teaching and evaluating three AWS placement patterns from a Vietnam client:

1. Singapore API → Singapore PostgreSQL.
2. Hanoi Local Zone API → Hanoi PostgreSQL.
3. Singapore API → private Hanoi PostgreSQL (Hybrid).

The intended `cost_minimal` AWS deployment has exactly two EC2 instances, not three. Singapore EC2 hosts the Singapore API, Hybrid API and Singapore PostgreSQL. Hanoi EC2 hosts the Hanoi API and Hanoi PostgreSQL on encrypted EBS. The static frontend is a separate Singapore Regional S3 website; S3 is not in the API-to-database request path.

The application stack is React/Vite, Fastify, PostgreSQL, PowerShell, Terraform, Docker Compose/Toxiproxy local emulation and a loopback-only Node control agent. Do not rewrite it or create a slide system.

## Current state

- Local implementation: working and running at checkpoint time.
- AWS state: **NOT_DEPLOYED**.
- Active project EC2: 0.
- Active project EBS: 0.
- Project Elastic IPs: 0.
- Active related Secrets Manager secrets: 0.
- Related secrets pending deletion: 2.
- Terraform apply/destroy executor: deliberately disabled.
- Cases 1–3 historical AWS evidence: preserved and labelled `HISTORICAL AWS_REAL`.
- Cases 4–5 AWS migration/snapshot/restore: not implemented or verified; do not continue them without a separate task.

Historical benchmark run `383ff454-5dd0-449f-ab75-b56ba62c0bd3` remains at `evidence/aws-real-benchmark-latest.json`. It contains 1,200 measured requests plus 60 excluded warm-ups and must never make the current environment appear live.

## Working URLs

- Portal overview: <http://localhost:3000/>
- Concepts: <http://localhost:3000/learn>
- Scenario explorer: <http://localhost:3000/scenarios>
- Guided setup: <http://localhost:3000/setup>
- Infrastructure explorer: <http://localhost:3000/infra>
- Benchmark console: <http://localhost:3000/benchmarks>
- Operations history: <http://localhost:3000/operations>
- Interactive end-to-end workspace: <http://localhost:3000/demo>
- Mini Order App: <http://localhost:8081>
- Loopback control agent: <http://127.0.0.1:3001>

## How to demonstrate the website

1. Start at `/` and show that current AWS is `NOT_DEPLOYED` while historical evidence is still available.
2. Use `/learn` for terminology and `/scenarios` to explain the physical API/database locations.
3. Use `/demo` for the guided interactive workflow. Select Cases 1–3, open **Behind the Action**, then run local allowlisted HTTP/PostgreSQL operations.
4. Use `/benchmarks` to run the three local scenarios sequentially, select metrics and hide/show scenario lines. Historical AWS and new local evidence remain separate.
5. Use `/infra` to inspect planned resources and deployment sequence. With no AWS deployment it must say planned, never actual.
6. Use `/operations` to inspect previous action status, timestamps, sanitized logs, exit codes and evidence locations.
7. Use the Mini Order App to select a local environment, list/read orders and create a labelled synthetic order. DELETE is not implemented.

The panel named **Trusted localhost terminal** is real execution output, but it is not an unrestricted shell. The browser selects only fixed server-defined actions. The loopback agent spawns fixed executables with fixed/sanitized arguments using `shell: false`, streams actual stdout/stderr over SSE and records exit status. Users cannot enter arbitrary commands.

## UI-to-command mapping

| UI action | Actual operation | Current availability |
|---|---|---|
| Check Lab Status | `powershell scripts/preflight/live-demo.ps1 -Profile <configured-profile>` | Read-only |
| Create Review Plan | `powershell .\lab.ps1 plan -Profile <configured-profile> -Region ap-southeast-1 -PresenterCidr <verified-ipv4/32>` | Read-only AWS discovery; local plan write only |
| Review Saved Plan | `powershell .\lab.ps1 review` | Read-only local plan rendering |
| Approve Apply | `POST http://127.0.0.1:3001/lifecycle/approvals` with plan SHA and `APPROVE APPLY <12-char-hash>` | Works; does not execute mutation |
| Deploy | Intended exact command: `terraform apply -input=false clone-review.tfplan` | Disabled: production mutation executor absent |
| Bootstrap | Terraform EC2 user-data in the reviewed plan | Not a separate action; `NOT_DEPLOYED` |
| Verify AWS Workload | `powershell infrastructure/terraform/scripts/verify-cost-minimal.ps1 -Profile <configured-profile> -Region ap-southeast-1` | Fixed `TEST_WRITE`; blocked until authorized deployment |
| Run All AWS Benchmarks | `powershell scripts/benchmark/aws-real.ps1 -Scenario All -Profile CostMinimal -Samples 100 -Warmups 5 -Origin "localhost allowlisted lifecycle agent"` | Blocked until all three live paths are verified |
| Review Cleanup | `powershell .\lab.ps1 cleanup-preview -Profile <configured-profile> -Region ap-southeast-1` | Read-only; verified working |
| Verify Residuals | Same `cleanup-preview` operation after cleanup | Read-only |
| Approve Destroy | `POST /lifecycle/approvals` with exact destroy plan hash, phrase and protected-volume retention decision | Contract implemented; no destroy manifest exists |
| Destroy | Exact approved saved destroy plan only | Disabled: no plan/executor |

Local actions additionally call fixed `/health`, `/api/topology`, `/api/orders` and `/api/benchmark/db?n={1|5|10|20}` requests, or the fixed local scripts in `scripts/emulation/`.

## Lifecycle safety implementation

- Agent binds to `127.0.0.1` and trusts only `http://localhost:3000` and `http://127.0.0.1:3000` browser origins.
- POST requests require the in-memory CSRF token returned by `/session`.
- No browser-supplied executable or arbitrary argument array exists.
- Apply approval is bound to plan SHA-256, complete Terraform/module/artifact/frontend fingerprints, AWS account, Region and deployment identity.
- Approval expires after 15 minutes and is one-use.
- Changed plan/configuration, wrong phrase/hash, expired approval and concurrent lifecycle operations are rejected.
- Destroy additionally requires `RETAIN_PROTECTED_VOLUMES` or `DELETE_PROTECTED_VOLUMES`.
- Production has no mutation executor. Automated tests inject a fake executor only.

## Verification and evidence

Latest completed checks:

- `npm test`: PASS, 35 tests (backend 5, dashboard 12, agent 18).
- `npm run typecheck`: PASS for all workspaces.
- `npm run build`: PASS for all workspaces.
- `terraform fmt -check -recursive infrastructure/terraform`: PASS.
- PowerShell parser checks for lifecycle/build/verify/benchmark scripts: PASS.
- Clean directory `npm ci`: PASS.
- Clean artifact build invoked from another working directory: PASS.
- Clean and primary read-only Terraform plan: **48 create, 0 change, 0 destroy**.
- `lab.ps1 review`: PASS; no apply attempted.
- `lab.ps1 cleanup-preview`: PASS; zero active project infrastructure and two pending-deletion secrets.
- Playwright `/demo` desktop and 390×844 smoke: PASS; zero console errors/warnings.
- Browser Cleanup Preview streamed real logs and exit code 0.
- Browser exact-plan approval succeeded while Deploy remained disabled.

Runtime action evidence is ignored under `evidence/agent-runs/`. Approval manifests are ignored under `evidence/lifecycle/`. The historical AWS benchmark latest pointer is intentionally versionable.

## Known infrastructure findings and limitations

- The earlier 45-resource clean plan was a build-path bug: frontend build output was written to the caller workspace. `build-artifacts.ps1` now builds inside its resolved repository root. The three recovered resources are S3 `index.html`, CSS and JavaScript objects; the correct plan is 48 resources.
- The pinned ECS-optimized AL2023 AMI is still available, x86_64/HVM and uses the reviewed 30-GiB source snapshot, but it is no longer the current SSM-recommended image. Re-review immediately before a real deployment.
- Both launched root volumes are configured encrypted and at least 30 GiB. Both PostgreSQL gp3 volumes are encrypted and have `prevent_destroy=true`.
- A future destroy requires an explicit volume-retention decision and a separately generated/reviewed destroy plan.
- Artifact upload is ordered through Terraform references before instance creation. Hanoi is created before Singapore; Singapore waits for Hanoi's secret before Hybrid startup.
- Secret resources use unique `name_prefix`, avoiding collisions with historical names pending deletion.
- The old SSM repair wrapper pins destroyed historical instance identities and must not be used for a fresh deployment.
- Native fresh-account user-data bootstrap has not yet been re-proven end to end after teardown.
- The cost-minimal frontend/API are plain HTTP and API ingress is restricted to a reviewed presenter IPv4 `/32`; this is a lab profile, not a production security architecture.
- Verification creates one labelled synthetic order per API. The backend has no DELETE endpoint.
- Different EC2 types, client origin, routing and cache/load conditions limit location-only benchmark comparisons.

## Remaining work in priority order

1. In a separately authorized session, re-review the pinned/current AMI choice, account, Region, Hanoi Local Zone access, quota, presenter `/32`, artifact hash and 48-resource saved plan.
2. Implement or temporarily enable the real saved-plan executor only for an explicitly authorized end-to-end rehearsal; never substitute a different plan after approval.
3. Apply the approved plan and prove both instances' native user-data bootstrap without using the historical repair wrapper.
4. Run `verify-cost-minimal.ps1`; confirm Cases 1–3 healthy and `deploymentState=DEPLOYED` evidence.
5. Run all AWS benchmarks and keep them distinct from historical run `383ff454-...`.
6. Design/generate a destroy plan that handles `prevent_destroy` and requires an explicit protected-volume decision; review before enabling destroy.
7. After authorized teardown, run residual audit and prove zero active billable project resources or document intentional retention.
8. Treat Cases 4–5 as a separate future task.

## Resume commands

From a fresh shell in the repository:

```powershell
npm ci
.\lab.ps1 doctor
.\lab.ps1 local -Build
.\lab.ps1 verify
```

To enable read-only AWS lifecycle buttons for an authorized profile:

```powershell
aws sso login --profile <profile>
.\lab.ps1 doctor -Profile <profile>
.\lab.ps1 local -Profile <profile>
.\lab.ps1 status -Profile <profile>
.\lab.ps1 cleanup-preview -Profile <profile>
```

For read-only plan preparation only:

```powershell
.\lab.ps1 artifacts
.\lab.ps1 plan -Profile <profile> -PresenterCidr <verified-ipv4>/32
.\lab.ps1 review
```

Do not run Terraform apply/destroy from these instructions. See `QUICKSTART.md` and `note.md` before continuing.

To stop only local containers while preserving named volumes and evidence:

```powershell
docker compose -f docker-compose.yml -f docker-compose.emulation.yml down
```

Do not add `-v` unless the user separately asks to delete local database volumes.

## Git and sensitive-file checkpoint

The worktree is intentionally uncommitted. Do not reset, checkout or discard it. `.gitignore` covers `.env`, `.terraform`, `*.tfstate*`, `*.tfplan`, `*.tfvars`, Docker artifact archives, runtime logs, agent runs and lifecycle manifests. Historical Terraform state backups remain local/ignored. Only `.env.example` and `.env.emulation.example` templates are tracked; verify they remain placeholder-only before commit.
