# Phase 0–1 Implementation Plan

Status date: 2026-10-28. Scope is intentionally limited to research and the portable localhost increment. No AWS resources are created by this plan.

## Architecture decision record

### ADR-001 — Fair baseline before managed-service comparison

Use the same React, Node.js, PostgreSQL 16, Docker, and migration artifacts for the Singapore and Hanoi baselines. PostgreSQL runs on EC2 in both baselines because RDS is not supported in Hanoi. `sg_managed` is a later trade-off profile, never evidence for a geography-only latency claim.

### ADR-002 — One regional VPC, explicit Local Zone subnet

Phase 2 will extend one `ap-southeast-1` VPC into `ap-southeast-1-han-1a`. The Hanoi database accepts PostgreSQL only from the application security group over private addressing. Local Zone opt-in is an operator-approved prerequisite and is never automatic.

### ADR-003 — Measurements are event records, not visual effects

Every sample contains a timestamp, origin, destination, HTTP method/path/status, request ID, client elapsed time, and server timing. Empty UI states say `NOT TESTED`. The localhost dashboard currently measures browser → local API → local PostgreSQL; it never labels these samples Singapore or Hanoi.

### ADR-004 — Narrow control agent

The control agent exposes typed action IDs mapped to fixed executable/argument arrays. It uses `spawn` with `shell: false`, a reduced environment, output redaction, timeouts, and no arbitrary command input. Phase 1 includes read-only preflight actions only.

### ADR-005 — Separate EBS snapshot chains

Future local and regional snapshot demonstrations use two disposable Hanoi EBS volumes. A volume whose latest snapshot is local must continue locally; one whose latest snapshot is regional must continue regionally.

## Delivery checkpoints

- Phase 0: repository inventory, official-doc review, service checklist, architecture decisions, permissions/cost preflight.
- Phase 1: real local three-tier order app, database migrations/seed, measured HTTP/DB endpoints, presenter dashboard, allowlisted agent, Compose, tests, and run instructions.
- Phase 2: Terraform network and matching EC2/Docker baselines, ALBs, security groups, runtime inventory, and teardown. `terraform apply` requires explicit approval.

## Phase 1 acceptance mapping

| Requirement | Evidence |
| --- | --- |
| Real three-tier app | React calls Fastify; Fastify uses parameterized PostgreSQL queries |
| Real local metrics | Browser samples `/api/benchmark/db`; backend performs sequential SQL round trips |
| No false AWS identity | `/api/topology` returns `aws.status=NOT_CONNECTED` locally |
| Safe control plane | Three fixed read-only AWS actions; no body-supplied executable or arguments |
| Reproducible local environment | `docker compose up --build` |
| Portable verification | workspace tests, TypeScript builds, Compose health checks, HTTP smoke checks |

## Phase 2 gate

Before any apply: confirm account, AWS profile, budget owner, Local Zone opt-in decision, quotas, offered instance types, public IPv4/NAT/ALB cost choices, SSH/SSM access strategy, TLS/DNS ownership, and teardown window. Save `terraform plan`; require operator approval; tag everything `Project=hanoi-lz-live-demo`.

## Phase 2B-1 infrastructure readiness

The `thangvn` SSO profile passes STS; Hanoi is opted in and returns 33 offerings. Functional smoke and full Terraform roots now produce non-empty saved plans, but no plan has been applied. `LOCAL_NETWORK_EMULATION` remains the presentation path until live AWS verification succeeds. See `docs/PHASE_2B1_TERRAFORM_REVIEW.md` for the current gate.
