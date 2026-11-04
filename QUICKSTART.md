# AWS Hanoi Local Zone Lab — Quickstart

The default rehearsal is local. It creates no AWS resources and labels all shaped latency as `LOCAL_EMULATION`.

## Prerequisites

- Node.js 22+
- Docker Desktop with Compose
- PowerShell 7 or Windows PowerShell 5.1
- Terraform and AWS CLI v2

## Fresh-clone rehearsal

```powershell
npm ci
.\lab.ps1 doctor
.\lab.ps1 local -Build
.\lab.ps1 verify
```

Open:

- Portal: <http://localhost:3000>
- Benchmark console: <http://localhost:3000/benchmarks>
- Interactive lab workspace: <http://localhost:3000/demo>
- Mini order app: <http://localhost:8081>

Verify locally:

```powershell
.\lab.ps1 verify
npm test
npm run typecheck
npm run build
```

## Optional read-only AWS checks

Choose your own authorized profile; the entrypoint never assumes an account or profile.

```powershell
aws sso login --profile <profile>
.\lab.ps1 doctor -Profile <profile>
.\lab.ps1 status -Profile <profile>
.\lab.ps1 cleanup-preview -Profile <profile>
```

Create a local Terraform review plan with one verified IPv4 `/32`:

```powershell
.\lab.ps1 artifacts
.\lab.ps1 plan -Profile <profile> -PresenterCidr 203.0.113.10/32
.\lab.ps1 review
# or review the detected proposal explicitly:
.\lab.ps1 plan -Profile <profile> -ConfirmDetectedCidr
```

`artifacts` builds the frontend and the reviewed Docker image bundle locally. `plan` runs Terraform init, validate and plan only; `review` renders the saved `clone-review.tfplan`. None runs `terraform apply`. Do not use the documentation-only example address in a real plan.

For a future separately authorized rehearsal, the website sequence is:

1. Run the commands above and inspect all plan addresses, estimated cost, account suffix, profile, Region and hash.
2. In `/demo`, enter `APPROVE APPLY <12-char-plan-hash>`. The normal agent still refuses execution.
3. Only after separate authorization, start an agent build that explicitly injects `TerraformSavedPlanExecutor` and `AwsCliIdentityVerifier`; there is intentionally no default enable flag in this checkpoint.
4. Execute the one-time approval, reconcile bootstrap, verify Cases 1–3, then run all AWS benchmarks.
5. Review cleanup, run `destroy-plan` with the explicit volume decision, approve that exact hash, execute once, and run residual audit.

Never invoke a raw `terraform apply`/`destroy` outside the saved-plan gate merely to bypass the disabled website button.

To make the configured profile available to the localhost agent, start local mode with it explicitly:

```powershell
.\lab.ps1 local -Profile <profile>
```

In `/demo`, Check Lab Status, Create Review Plan, Review Saved Plan and Review Cleanup are working read-only actions. The portal now exposes the complete state sequence `NOT_DEPLOYED → PLAN_READY → APPROVED → APPLYING → INFRA_DEPLOYED → BOOTSTRAPPING → VERIFYING → READY`; apply success alone never means ready. Live bootstrap reconciliation, verification, benchmarks, destroy-plan preparation and residual audit remain state-gated while AWS is `NOT_DEPLOYED`.

The saved-plan executor implementation exists and is covered by fake-executor/SSE tests, but the normal `agent/src/index.ts` startup deliberately injects neither the Terraform executor nor the runtime STS verifier. Therefore real Apply and Destroy remain disabled until a separately authorized end-to-end rehearsal changes that startup boundary.

## Website lifecycle action mapping

The browser never accepts a shell command. It selects one of these fixed localhost-agent actions:

| UI action | Exact operation | Current gate |
|---|---|---|
| Check Lab Status | `powershell scripts/preflight/live-demo.ps1 -Profile <configured-profile>` | Read-only |
| Create Review Plan | `powershell .\lab.ps1 plan -Profile <configured-profile> -Region ap-southeast-1 -PresenterCidr <verified-ipv4/32>` | Read-only AWS discovery; writes only a local saved plan and manifest |
| Review Saved Plan | `powershell .\lab.ps1 review` | Reads `clone-review.tfplan` |
| Approve exact apply plan | `POST http://127.0.0.1:3001/lifecycle/approvals` with exact plan SHA-256 and `APPROVE APPLY <12-char-hash>` | Loopback, trusted Origin and CSRF token required; approval expires after 15 minutes |
| Deploy | Exact saved-plan command: `terraform apply -input=false -no-color clone-review.tfplan` | **Disabled by default:** executor and runtime STS verifier are not installed by normal startup |
| Reconcile Bootstrap | `powershell infrastructure/terraform/scripts/bootstrap-readiness.ps1 -Profile <configured-profile> -Region ap-southeast-1` | Read-only; after Apply it dynamically checks both instances, SSM Online, artifact SHA-256, secret initialization and Hanoi → Singapore → Hybrid health; sends no SSM command |
| Verify AWS Workload | `powershell infrastructure/terraform/scripts/verify-cost-minimal.ps1 -Profile <configured-profile> -Region ap-southeast-1` | **NOT_DEPLOYED**; explicit synthetic-write confirmation; one labelled order per API |
| Run All AWS Benchmarks | `powershell scripts/benchmark/aws-real.ps1 -Scenario All -Profile CostMinimal -Samples 100 -Warmups 5 -Origin "localhost allowlisted lifecycle agent"` | Enabled only after Singapore, Hanoi and Hybrid are all live-verified |
| Review Cleanup | `powershell .\lab.ps1 cleanup-preview -Profile <configured-profile> -Region ap-southeast-1` | Read-only tagged AWS, reviewed-bucket and Terraform-state inventory |
| Prepare Destroy Plan | `powershell .\lab.ps1 destroy-plan -Profile <configured-profile> -Region ap-southeast-1 -VolumeDecision <RETAIN_PROTECTED_VOLUMES|DELETE_PROTECTED_VOLUMES>` | Read-only AWS discovery and local plan writes only; `RETAIN` deliberately blocks a full destroy plan |
| Approve destroy | `POST http://127.0.0.1:3001/lifecycle/approvals` with `APPROVE DESTROY <12-char-hash>` and the same explicit protected-volume decision bound into the plan | Requires a fresh `destroy-plan`; approval is one-use and 15-minute TTL |
| Destroy | Exact saved-plan command: `terraform apply -input=false -no-color destroy-review.tfplan` | **Disabled by default**; exact S3 versions/delete markers are revalidated immediately before execution |
| Verify Residuals | Fixed `aws.residual-audit` action calling `lab.ps1 cleanup-preview` | Only a clean audit can return lifecycle state to `NOT_DEPLOYED` |

Apply/destroy approval is bound to the saved plan bytes, complete configuration/artifact/frontend fingerprints, AWS account, profile, Region and deployment identity. Plans expire after 24 hours; approvals expire after 15 minutes and are consumed atomically once. Any changed or missing file, changed plan, wrong runtime identity, expired/used approval, agent restart with a lost approval, or concurrent lifecycle action is rejected. Interrupted execution becomes `FAILED` and requires reconciliation. The browser receives only the account suffix.

New live benchmark runs write `evidence/aws-real-benchmark-live-latest.json`. The tracked `evidence/aws-real-benchmark-latest.json` remains the immutable retained historical run and is never overwritten by the live runner.

## Cases 1–3 and benchmarks

- `/demo`: choose Singapore, Hanoi or Hybrid and execute allowlisted local operations.
- `/benchmarks`: run all three local scenarios or inspect retained historical AWS evidence.
- `http://localhost:8081`: create/read synthetic `DEMO-*` orders. DELETE is not implemented.

Local measurements use real HTTP/PostgreSQL operations with illustrative shaping. They are not AWS performance evidence.

## Troubleshooting

- Agent offline: rerun `.\lab.ps1 local -Profile <profile>` and inspect `evidence/agent-local.stderr.log`.
- SSO expired: run `aws sso login --profile <profile>`, then rerun `doctor` or preflight. A failed refresh does not change lifecycle state and must not promote retained inventory or benchmark evidence to live AWS availability.
- Plan says artifact missing: run `.\lab.ps1 artifacts` and inspect the emitted SHA-256.
- Presenter IP changed: verify the current address and regenerate the plan with the new `/32`; never use `0.0.0.0/0`.
- Pending-deletion secrets: cost-minimal uses unique `name_prefix` values; do not restore or purge old secrets merely to make a rehearsal pass.
- Plan reports 45 rather than 48 creates: ensure the current `build-artifacts.ps1` is present and rerun `artifacts`; it builds `app/frontend/dist` relative to the clone, even when invoked from another working directory. A clean plan should include `index.html`, one CSS object and one JS object and report 48 creates.
- Old SSM repair wrapper: do not run it for a fresh deployment. It is intentionally pinned to the destroyed historical instance identities; fresh instances must bootstrap through reviewed Terraform user-data and then pass `verify-cost-minimal.ps1`.
- Lifecycle says `FAILED` after restart: this is deliberate for interrupted Apply/Bootstrap/Verify/Destroy or a lost in-memory approval. Run read-only reconciliation; never retry automatically.
- Destroy plan with `RETAIN_PROTECTED_VOLUMES`: this is deliberately blocked. A full destroy cannot retain Terraform-managed volumes while honestly claiming zero managed resources, and the workflow never uses `terraform state rm` as a shortcut.

## Stop local rehearsal

```powershell
docker compose -f docker-compose.yml -f docker-compose.emulation.yml down
```

This removes local containers and networks only. It does not call AWS.

Restart with `.\lab.ps1 local`. Named local database volumes remain unless an operator separately and explicitly deletes them.
