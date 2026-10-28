# CODEX MASTER PROMPT — AWS Hanoi Local Zone Live Architecture & Latency Lab

You are a senior AWS Solutions Architect, SRE, and full-stack engineer. Build a **real, auditable demonstration lab**, not a fake animation, for a technical talk: “AWS Hanoi Local Zone for Vietnam Workloads: Architecture, Data Residency & Trade-offs.”

## Outcome

Create a local web-based, presenter-friendly demo console which orchestrates and visualizes a real 3-tier workload deployed in AWS Singapore Region (`ap-southeast-1`) and Hanoi Local Zone (`ap-southeast-1-han-1a`), measures actual latency/HTTP variation, demonstrates a hybrid Singapore app → Hanoi PostgreSQL database, runs a verified migration, and creates/restores AWS EBS Local Snapshots.

**NON-NEGOTIABLE:** There must be no simulated AWS output, invented metrics, fabricated execution logs, hardcoded latency values, or charts derived from random data in LIVE mode. Clearly label MOCK/REPLAY mode, if optionally implemented. Show exactly what was measured, from where, and when. Never imply an AWS resource is physically in Hanoi based only on its API region `ap-southeast-1`; verify availability zone and snapshot location using AWS APIs.

## Verify facts before coding

Read official current AWS docs (do not guess service support):
- Hanoi Local Zone GA and supported services: https://aws.amazon.com/about-aws/whats-new/2026/06/aws-local-zones-hanoi-vietnam/
- Zones and parent: https://docs.aws.amazon.com/local-zones/latest/ug/available-local-zones.html
- Local snapshots and important snapshot-chain restriction: https://docs.aws.amazon.com/ebs/latest/userguide/snapshots-localzones.html
- CLI snapshot `--location local` or `regional`: https://docs.aws.amazon.com/cli/latest/reference/ec2/create-snapshot.html
- S3 Local Zone directory bucket (NOT general-purpose bucket): https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-directory-bucket-LZ.html
- Directory bucket limitations including no S3 versioning/replication/s3 sync: https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-express-differences.html
- ECS Fargate is NOT supported in Local Zones: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cluster-regions-zones.html
- ALB supports at least one Local Zone subnet (as opposed to regional >=2 AZ subnets): https://docs.aws.amazon.com/elasticloadbalancing/latest/application/create-application-load-balancer.html

Current relevant facts: parent region `ap-southeast-1`, Hanoi Local Zone `ap-southeast-1-han-1a`, zone ID `apse1-han-az1`, zone group `ap-southeast-1-han-1`; Hanoi supports EC2 C7i/M7i/R7i, ECS EC2, ALB, EBS gp3 and Local Snapshots, S3 directory buckets with One Zone-IA. RDS PostgreSQL/ElastiCache are not locally supported in Hanoi. CloudFront is a global edge CDN, not a service physically installed within Hanoi Local Zone. EBS snapshots default to the parent Region unless local destination is selected. A snapshot chain on a given volume cannot switch between local and regional snapshot destinations after the first snapshot, so **use two separate disposable test volumes** for the destination demonstration.

## Build design: one codebase, separate infrastructure profiles

Create a representative Mini Order Management application with:
- frontend: static HTML/CSS/vanilla JavaScript or lightweight Vite frontend. No complex framework required. Nginx serves frontend; API endpoints never cached by CloudFront.
- backend: TypeScript + Node.js (Fastify or Express), parameterized PostgreSQL queries; structured trace logging with request ID; `/health`, `/api/topology`, `/api/orders` GET/POST, `/api/orders/:id`, `/api/benchmark/db?n=1|5|10|20`, `/api/benchmark/write`. `n` is bounded and each query is a real small SQL round trip, sequential when demonstrating RTT amplification. Generate synthetic orders only, no personal/customer/production data.
- database: PostgreSQL 16+ with migrations, indexes, seed data; attach a data EBS volume on Hanoi. Avoid exposing port 5432 to the public Internet.
- optional object attachment demo: Singapore S3 general-purpose bucket vs Hanoi S3 directory bucket with One Zone-IA. Only if real support/permissions confirmed at runtime. Do not claim S3 directory bucket is interchangeable with regional S3 Standard.

Infrastructure as code: Terraform, modular, with tagging `Project=hanoi-lz-live-demo`, configurable profile/account/cost cap and teardown guide. Prefer one VPC spanning at least two Singapore AZ subnets and the Hanoi Local Zone subnet, with private database connectivity and tightly scoped security groups. Document local-zone routes and data paths. Local Zone opt-in is an explicit privileged setup operation, not performed silently.

Profiles:
1. `sg_baseline`: same EC2 / Docker + PostgreSQL on EC2 stack to control app/DB software and compute variables for apples-to-apples latency comparison. Regional ALB and SG subnets.
2. `han_baseline`: same containerized app, PostgreSQL on EC2 + EBS gp3 in `ap-southeast-1-han-1a`; Hanoi ALB in a Local Zone subnet. Supported EC2 instance types discovered via API; no assumption that cheap T3 is available locally.
3. `sg_managed` (follow-up phase): SG ECS Fargate (or ECS EC2) + RDS PostgreSQL Multi-AZ as an **architecture/service trade-off profile**, NOT the primary fair performance comparison.
4. `han_ecs` (follow-up phase): ECS EC2 capacity provider for Hanoi, only after EC2/Docker baseline runs end-to-end; no Fargate there.
5. `hybrid_sg_app_han_db`: SG frontend and API using **private network address** to Hanoi PostgreSQL with controlled connectivity; no publicly accessible database.

Make comparison labels explicit: `FAIR BASELINE` versus `MANAGED VS SELF-MANAGED ARCHITECTURE` to avoid attributing instance/RDS differences to geography alone.

## The five mandatory real scenarios

CASE 1: Full Singapore. Deploy stack, run real GET/POST and DB read benchmarks, capture AWS resource identity (instance AZ, DB location), record request evidence.

CASE 2: Full Hanoi. Deploy same application, consistent seed and similar instance class, same requests, record AWS `AvailabilityZone` and EBS AZ, compare p50/p95/p99 to Case 1.

CASE 3: SG app / Hanoi DB. Make application target Hanoi database via private networking; run 1/5/10/20 sequential SQL queries per HTTP request, show the request waterfall and DB timing. Verify hybrid request includes both SG app and Hanoi DB identities. Optional separate reverse/hypothetical scenario must not be represented as measured without deployment.

CASE 4: Real migration SG -> Hanoi. Implement a safe, repeatable demo with initial order count and deterministic sample records. Put source into read-only/maintenance mode; export with `pg_dump -Fc`; transfer over secure authenticated channel; `pg_restore` in Hanoi; verify row counts, sample IDs, and content checksums; deploy/switch application endpoint; create a post-migration order and verify it lands only in Hanoi DB. Show elapsed step durations and actual command exit statuses. Include rollback procedure to SG if cutover fails. Explicitly report write downtime, RPO/RTO. Leave CDC/DMS as an OPTIONAL advanced module; no false zero-downtime claim. Map RDS -> self-managed PostgreSQL and S3 Standard -> S3 One Zone-IA directory bucket, including feature gaps.

CASE 5: Real backup/restore and residency. Create a sample order. Create `pg_dump` logical backup and verify `pg_restore`. Create **Hanoi EBS Local Snapshot** (`aws ec2 create-snapshot --location local`) from the dedicated data volume after safe quiescing/DB consistency measures. Wait for completed state, inspect SnapshotId, State, Location, timestamp. Restore into a **new EBS volume in Hanoi**, attach to a disposable recovery EC2 instance (or mount separately using an isolated recovery service), verify that sample record can be recovered. Separately create a `--location regional` snapshot **from another disposable volume**, or inspect pre-existing one, to contrast location. Do NOT try both snapshot destinations sequentially on the same source volume due to snapshot-chain restriction. Demonstrate that EBS Local Snapshot and S3 One Zone-IA alone do NOT provide independent-LZ disaster recovery; explain a second Vietnam provider/independent fault domain and separate backups as an architecture option, not a provisioned AWS service. Do not copy any sensitive data outside Vietnam just to demonstrate `regional` snapshot.

## Measurement design — accuracy rules

Collect actual timed samples (e.g. 100–300 per location, configurable, concurrency default 1 with optional concurrency 5), with a warm-up stage and identical payload and connection reuse policy. Include both `Browser/laptop in Vietnam -> public API` timings and `App -> DB query round-trip` server-side timing. Optionally run SG EC2 -> Hanoi DB and Hanoi EC2 -> SG API measurements from agents in those AWS instances.

For each measurement emit timestamp, scenario, test-origin location and vantage, test destination, request method/path, payload size, HTTP status, success/failure, response `Server-Timing` and request ID, client elapsed time, server app time, DB elapsed time, and infrastructure identity. From real samples compute p50/p95/p99, min/max, average, standard deviation, throughput, timeout rate, and **HTTP latency variation** = mean(abs(latency[i]-latency[i-1])) with definition printed in UI. Never call HTTP request variation a formal network packet jitter measurement. Separate `ping`/TCP-probe/network jitter if independently collected; do not depend on ICMP success. Report test origin and note city and ISP affect results. Disable client caching for benchmark endpoints; do not let CloudFront cache `/api/*` or mix CloudFront cache hits with direct-origin benchmark results. Use monotonic clocks when possible and show separate client and server durations rather than falsely treating them as identical or subtracting independent unsynchronized wall clocks.

## Local control plane / command visualization

Create a local Node.js control agent bound ONLY to `127.0.0.1` and a presenter UI at `http://localhost:3000` (or similar). Frontend calls **typed predefined backend actions**, not arbitrary shell strings. Agent runs allowlisted commands with `spawn` argv arrays, no `shell:true`, validates resource IDs, request sizes and endpoints, enforces timeouts and concurrency, masks secrets, does not leak environment variables. Read AWS credentials from existing AWS CLI profile/SSO/instance role, never embed access keys. Present real command preview and stream actual stdout/stderr, started/finished timestamps, exit code, AWS resource IDs, error and success state using SSE/WebSockets. Every destructive action (Terraform destroy, snapshot test cleanup, failover/cutover, data delete) must require explicit confirmation and have a separate dry-run preview. **Do not perform unattended cloud provisioning or charge-incurring actions without explicit operator approval.** No fake 'green' status until API verification succeeds.

Support `LIVE` mode (real AWS only) and optional `REPLAY` mode (saved real trace file; prominently labeled `RECORDED`, with its original timestamp). No fabricated MOCK data in live demos.

## UI/UX requirements

Build responsive polished dark neutral dashboard optimized for a 16:9 projector (1920x1080) and decent laptop display, with distinctive blue/amber accents and readable type. Plain HTML/CSS/JS is acceptable for UI; use Chart.js or similar small charting package for sample time series. Have fixed navbar and tabs:
- `Overview`: infrastructure identity, readiness cards for SG and HN, account/AZ/status, evidence/source badge, simplified diagrams, provenance.
- `Latency Lab`: side-by-side Singapore/Hanoi live cards, Start/Stop test, p50/p95/p99/HTTP variation/timeout counters, histogram or line chart, request waterfall, test-origin details; command/log console collapsible underneath.
- `Hybrid DB`: topology SG app -> HN DB, slider n=1/5/10/20 sequential DB round trips, real query breakdown, benchmark chart vs n, formula and caveats.
- `Migration`: sequence/stepper preflight -> initial state -> export -> transfer -> restore -> validate -> cutover -> post-cutover check -> rollback; before/after data evidence.
- `Backup & Residency`: topology of local-vs-parent-region snapshot destination, buttons to create/inspect/restore local snapshot, restore verification, S3 directory bucket and independent-failure-domain caveat. Highlight `SnapshotId` and verified `Location`.
- `Architecture`: comparison matrix of exact supported features and runtime-verified AWS inventory. CloudFront at global/edge layer, not displayed as inside Hanoi LZ.

Use meaningful errors, partial failures, loading and empty states. Display an explicit `NOT TESTED` rather than 0ms or green. Charts must show tooltips with raw sample count and test timestamps. Include exporter for CSV/JSON real measurement evidence and presenter-friendly “show CLI command” section.

## CLI/preflight command examples (parameterize identifiers)

```bash
aws sts get-caller-identity
aws ec2 describe-availability-zones --region ap-southeast-1 --all-availability-zones --filters Name=zone-type,Values=local-zone --query 'AvailabilityZones[?ZoneName==`ap-southeast-1-han-1a`].[ZoneName,ZoneId,GroupName,OptInStatus,ParentZoneName]'
aws ec2 describe-instance-type-offerings --region ap-southeast-1 --location-type availability-zone --filters Name=location,Values=ap-southeast-1-han-1a
# Explicit setup step only, after permission/cost confirmation:
# aws ec2 modify-availability-zone-group --region ap-southeast-1 --group-name ap-southeast-1-han-1 --opt-in-status opted-in
# Verified actual EBS volume ID supplied by terraform output:
aws ec2 create-snapshot --region ap-southeast-1 --volume-id "$HAN_DATA_VOLUME_ID" --location local --description 'han-demo-local-backup'
# Poll and describe snapshot by actual ID returned above:
aws ec2 describe-snapshots --region ap-southeast-1 --snapshot-ids "$SNAPSHOT_ID" --query 'Snapshots[].{ID:SnapshotId,Location:Location,State:State,Started:StartTime}'
```

Use official AWS API reference to verify any CLI option and return field before implementing production path. The shell snippets are illustrative only; do not hardcode IDs or credentials. A local snapshot's state must be completed before restore action. For regional comparison create snapshot on a second independent lab EBS volume.

## Requested repo layout

```text
hanoi-localzone-live-lab/
  README.md
  docs/ARCHITECTURE.md
  docs/DEMO_RUNBOOK.md
  docs/MIGRATION.md
  docs/BACKUP_DR.md
  docs/DATA_RESIDENCY_BOUNDARIES.md
  docs/COST_AND_CLEANUP.md
  docs/AWS_VERIFICATION.md
  infrastructure/terraform/modules/{network,sg-baseline,han-baseline,sg-managed,han-ecs}/
  infrastructure/terraform/environments/demo/
  app/frontend/
  app/backend/
  app/db/{migrations,seeds}/
  dashboard/
  agent/
  scripts/{preflight,benchmark,migrate,backup,restore,cleanup}/
  evidence/README.md
  tests/{unit,integration,aws-smoke}/
  .env.example
  Makefile
```

## Build plan / delivery checkpoints

PHASE 0 — Research, inspect existing repo, provide `IMPLEMENTATION_PLAN.md`, service availability checklist and permissions/cost preflight. Do not provision anything yet. If in an existing project, adapt to its conventions and preserve existing slides.

PHASE 1 — Build portable app, DB migrations/seed and localhost dashboard, localhost agent, well-defined JSON data contracts and unit tests. `docker compose up --build` must work without AWS. In the UI, live AWS status remains `NOT CONNECTED` until actually connected.

PHASE 2 — Terraform VPC and real EC2+Docker stacks in SG and Hanoi, ALB readiness, private database network; optional RDS/ECS only after baseline verified. Include exact `terraform plan`, outputs and destroy commands. Require approval before applying.

PHASE 3 — Real benchmarks, server instrumentation, samples/traces, statistical charts, CLI streaming and export. Ensure location/identity evidence.

PHASE 4 — Real cross-zone PostgreSQL hybrid scenario and actual migration runbook with validation and rollback; optionally managed service mapping.

PHASE 5 — Snapshot preflight, local snapshots, independent regional comparison volume, end-to-end restore proof; security/data residency audit and presenter runbook.

Produce working increments, not all-at-once speculative code. After each phase give files changed, commands to reproduce, tests run, AWS resources provisioned (if any), estimated running costs (price source/date; no invented amounts), known limitations, and next checkpoint. Do not claim completion of an acceptance criterion without a passing real test.

## Acceptance criteria

- [ ] Both SG and Hanoi stacks serve the same real order app from AWS, not localhost mock.
- [ ] Runtime AWS API proves Singapore instances' AZ and Hanoi instances' exact Local Zone; supported instance type availability checked.
- [ ] Every benchmark sample is a measured HTTP request with a status and timestamp; metrics are computed from saved samples.
- [ ] Hybrid scenario visibly changes SG API's real DB target to Hanoi private DB; 1/5/10/20 real DB round trips compared with consistent payload.
- [ ] Actual PostgreSQL migration preserves sample orders; checksums/row counts and post-cutover write verified.
- [ ] A real Hanoi `--location local` EBS snapshot completes; new EBS volume recovered from it; sample data verified in isolated recovery path.
- [ ] Regional snapshot destination comparison uses separate disposable EBS volume; no impossible snapshot-chain switching.
- [ ] Logs include allowlisted commands and real stdout/stderr/exit status, with credentials redacted.
- [ ] Clear separation of `LIVE` and `RECORDED`; no fabricated metrics.
- [ ] Security review: no public PostgreSQL, no arbitrary command execution, IAM least privilege, no accidental data export to Singapore, no production data.
- [ ] Full terraform destroy/cleanup guide and presenter runbook with tested fallback video/recorded **real** trace.

## Start NOW with Phase 0 + Phase 1 only

First inspect the current repository and ask no unnecessary questions. Give a concise architecture decision record and implement the portable app, database schema, basic local dashboard and agent stub with well-defined interfaces. Do not create any AWS resources without operator approval. Then show exactly how to start the app, what works locally, and which verified AWS steps are required for Phase 2.
