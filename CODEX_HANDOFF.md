# Codex Handoff — AWS Hanoi Local Zone Interactive Lab

Checkpoint date: 2026-11-04 (Asia/Saigon)

## Purpose and architecture

This repository is an interactive technical lab for teaching and evaluating three AWS placement patterns from a Vietnam client:

1. Singapore API → Singapore PostgreSQL.
2. Hanoi Local Zone API → Hanoi PostgreSQL.
3. Singapore API → private Hanoi PostgreSQL (Hybrid).

The intended `cost_minimal` AWS deployment has exactly two EC2 instances, not three. Singapore EC2 hosts the Singapore API, Hybrid API and Singapore PostgreSQL. Hanoi EC2 hosts the Hanoi API and Hanoi PostgreSQL on encrypted EBS. The static frontend is a separate Singapore Regional S3 website; S3 is not in the API-to-database request path.

The application stack is React/Vite, Fastify, PostgreSQL, PowerShell, Terraform, Docker Compose/Toxiproxy local emulation and a loopback-only Node control agent. Do not rewrite it or create a slide system.

## Current state

- Local implementation: source and automated tests are working; start runtime with the resume commands below.
- AWS state: **NOT_DEPLOYED**.
- Last verified active project EC2: 0.
- Last verified active project EBS: 0.
- Last verified project Elastic IPs: 0.
- Last verified active related Secrets Manager secrets: 0.
- Last verified related secrets pending deletion: 2.
- Terraform saved-plan apply/destroy executor: implemented and fake-tested, but deliberately not injected by the default agent startup; real mutation remains disabled.
- Cases 1–3 historical AWS evidence: preserved and labelled `HISTORICAL AWS_REAL`.
- Cases 4–5 AWS migration/snapshot/restore: not implemented or verified; do not continue them without a separate task.

Historical benchmark run `383ff454-5dd0-449f-ab75-b56ba62c0bd3` remains at `evidence/aws-real-benchmark-latest.json`. It contains 1,200 measured requests plus 60 excluded warm-ups and must never make the current environment appear live.

Checkpoint commit `871479b` preserves the completed interactive portal and historical evidence. The lifecycle-execution-readiness changes described below are the current uncommitted continuation; do not reset or discard them.

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
| Deploy | Exact command: `terraform apply -input=false -no-color clone-review.tfplan` | Executor implementation exists; default startup intentionally disables it |
| Reconcile Bootstrap | `powershell infrastructure/terraform/scripts/bootstrap-readiness.ps1 -Profile <configured-profile> -Region ap-southeast-1` | Read-only; dynamically checks EC2/SSM/artifact/secrets/Hanoi→Singapore→Hybrid after Apply |
| Verify AWS Workload | `powershell infrastructure/terraform/scripts/verify-cost-minimal.ps1 -Profile <configured-profile> -Region ap-southeast-1` | Fixed `TEST_WRITE`; blocked until authorized deployment |
| Run All AWS Benchmarks | `powershell scripts/benchmark/aws-real.ps1 -Scenario All -Profile CostMinimal -Samples 100 -Warmups 5 -Origin "localhost allowlisted lifecycle agent"` | Blocked until all three live paths are verified |
| Review Cleanup | `powershell .\lab.ps1 cleanup-preview -Profile <configured-profile> -Region ap-southeast-1` | Read-only EC2/EBS/EIP/VPC/SG/S3/secret/state inventory |
| Prepare Destroy Plan | `powershell .\lab.ps1 destroy-plan -Profile <configured-profile> -Region ap-southeast-1 -VolumeDecision <explicit-decision>` | Read-only AWS discovery plus local immutable plan; `RETAIN` blocks full destroy |
| Approve Destroy | `POST /lifecycle/approvals` with exact destroy-plan hash, phrase and matching protected-volume decision | One-use, 15-minute TTL |
| Destroy | `terraform apply -input=false -no-color destroy-review.tfplan` | Executor disabled by default; revalidates exact S3 versions/delete markers first |
| Verify Residuals | Fixed `aws.residual-audit` → `lab.ps1 cleanup-preview` | Only clean evidence returns state to `NOT_DEPLOYED` |

Local actions additionally call fixed `/health`, `/api/topology`, `/api/orders` and `/api/benchmark/db?n={1|5|10|20}` requests, or the fixed local scripts in `scripts/emulation/`.

## Lifecycle safety implementation

- Agent binds to `127.0.0.1` and trusts only `http://localhost:3000` and `http://127.0.0.1:3000` browser origins.
- POST requests require the in-memory CSRF token returned by `/session`.
- No browser-supplied executable or arbitrary argument array exists.
- Apply/destroy approval is bound to plan SHA-256, complete Terraform/module/cleanup-template/artifact/frontend fingerprints, AWS account, profile, Region and deployment identity.
- Approval expires after 15 minutes and is one-use.
- Saved plans expire after 24 hours. Changed plan/configuration/inventory, wrong phrase/hash/runtime identity, expired/reused approval, restart-lost approval and concurrent lifecycle operations are rejected.
- Destroy additionally requires `RETAIN_PROTECTED_VOLUMES` or `DELETE_PROTECTED_VOLUMES`.
- Approval consumption and the global lock occur atomically before asynchronous revalidation. There is no automatic retry.
- State is persistent and conservative: Apply exit zero stops at `INFRA_DEPLOYED`; only bootstrap plus Cases 1–3 verification reaches `READY`; interrupted work becomes `FAILED`; only clean residual evidence restores `NOT_DEPLOYED`.
- The production-capable executor uses hard-coded `terraform apply` argument vectors and `shell:false`. Default production startup has no executor/verifier injection. Automated tests use fake executors only.

## Verification and evidence

Latest completed checks:

- `npm test`: PASS, 51 tests (backend 5, dashboard 12, agent 34).
- `npm run typecheck`: PASS for all workspaces.
- `npm run build`: PASS for all workspaces.
- `terraform fmt -check -recursive infrastructure/terraform`: PASS.
- PowerShell parser checks for lifecycle/build/verify/benchmark scripts: PASS.
- Clean directory `npm ci`: PASS.
- Clean artifact build invoked from another working directory: PASS.
- Clean and primary read-only Terraform plan: **48 create, 0 change, 0 destroy**.
- `lab.ps1 review`: PASS; no apply attempted.
- `lab.ps1 cleanup-preview`: PASS; zero active project infrastructure and two pending-deletion secrets.
- Playwright route smoke for `/`, `/setup`, `/infra`, `/benchmarks`, `/operations` and `/demo`: PASS at 390×844; the portal reported `NOT_DEPLOYED`, the agent became ready, and mutation controls stayed disabled.
- Browser Cleanup Preview streamed real logs and exit code 0.
- Browser exact-plan approval succeeded while Deploy remained disabled.

Runtime action evidence is ignored under `evidence/agent-runs/`. Approval manifests are ignored under `evidence/lifecycle/`. The historical AWS benchmark latest pointer is intentionally versionable.

## Known infrastructure findings and limitations

- The earlier 45-resource clean plan was a build-path bug: frontend build output was written to the caller workspace. `build-artifacts.ps1` now builds inside its resolved repository root. The three recovered resources are S3 `index.html`, CSS and JavaScript objects; the correct plan is 48 resources.
- The pinned ECS-optimized AL2023 AMI is still available, x86_64/HVM and uses the reviewed 30-GiB source snapshot, but it is no longer the current SSM-recommended image. Re-review immediately before a real deployment.
- Both launched root volumes are configured encrypted and at least 30 GiB. Both PostgreSQL gp3 volumes are encrypted and have `prevent_destroy=true`.
- Destroy-plan preparation now exists. `DELETE_PROTECTED_VOLUMES` copies reviewed cleanup-only overrides that disable the two volume guards and enable bucket cleanup only after exact S3 version/delete-marker inventory. `RETAIN_PROTECTED_VOLUMES` deliberately blocks a full destroy; no `terraform state rm` shortcut exists.
- Artifact upload is ordered through Terraform references before instance creation. Hanoi is created before Singapore; Singapore waits for Hanoi's secret before Hybrid startup.
- Secret resources use unique `name_prefix`, avoiding collisions with historical names pending deletion.
- The old SSM repair wrapper pins destroyed historical instance identities and must not be used for a fresh deployment.
- Native fresh-account user-data bootstrap has not yet been re-proven end to end after teardown. The new readiness action is read-only and sends no repair command; it cannot replace that authorized proof.
- The cost-minimal frontend/API are plain HTTP and API ingress is restricted to a reviewed presenter IPv4 `/32`; this is a lab profile, not a production security architecture.
- Verification creates one labelled synthetic order per API. The backend has no DELETE endpoint.
- Different EC2 types, client origin, routing and cache/load conditions limit location-only benchmark comparisons.
- Profile `thangvn` was refreshed and read-only STS verification succeeded on 2026-11-04 for the expected account suffix `7667`. Hanoi Local Zone opt-in, `c7i.large` offering, 16-vCPU quota, pinned AMI compatibility and zero active project infrastructure were reconfirmed. Two related secrets remain pending deletion. A fresh immutable plan for `104.28.254.75/32` reports 48 create, 0 change and 0 destroy with hash prefix `1be2bfa4fe70`; real mutation remains disabled.

## Remaining work in priority order

1. In a separately authorized session, re-review the pinned/current AMI choice, account, profile, Region, Hanoi Local Zone access, quota, presenter `/32`, artifact hash and fresh saved plan.
2. Explicitly inject the existing `TerraformSavedPlanExecutor` plus `AwsCliIdentityVerifier` into a separately authorized agent build; do not add a casual environment-variable bypass.
3. Approve and execute the exact apply plan once. Confirm the state stops at `INFRA_DEPLOYED`, not `READY`.
4. Run read-only bootstrap readiness, then `verify-cost-minimal.ps1`; confirm Cases 1–3 and `deploymentState=DEPLOYED` evidence before `READY`.
5. Run all AWS benchmarks. New live evidence uses `aws-real-benchmark-live-latest.json`; never overwrite historical run `383ff454-...`.
6. Review cleanup inventory, generate a fresh destroy plan with an explicit protected-volume decision, review every delete address/S3 version, then separately authorize the exact destroy-plan hash.
7. Execute destroy once and run residual audit. `NOT_DEPLOYED` is allowed only after zero active project resources and zero managed state resources are independently proven.
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

Commit `871479b` is the reviewed portal/historical-evidence checkpoint. Lifecycle execution-readiness work after that commit remains intentionally visible in the worktree; do not reset, checkout or discard it. `.gitignore` covers `.env`, `.terraform`, `*.tfstate*`, `*.tfplan`, `*.tfvars`, generated cleanup overrides, Docker artifact archives, runtime logs, agent runs and lifecycle manifests. Historical Terraform state backups remain local/ignored. Only `.env.example` and `.env.emulation.example` templates are tracked.
