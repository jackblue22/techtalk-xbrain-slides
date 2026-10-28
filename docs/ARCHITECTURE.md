# Architecture

The current access fallback has three explicit evidence modes: `AWS_REAL`, `EXTERNAL_VN_REAL`, and `LOCAL_NETWORK_EMULATION`. Their admission rules and limitations are defined in `ACCESS_LIMITATION_FALLBACK.md`; the local mode must never be presented as cloud performance or geography proof.

## Local Phase 2A emulation

```text
Browser -> loopback Toxiproxy listeners -> SG / Hanoi / hybrid Node APIs
                                          |       |          |
                                          v       v          v (shaped TCP)
                                       SG DB   Hanoi DB   Hanoi DB

pg_dump -> shared local evidence volume -> pg_restore -> recovery DB
```

The proxy delays are operator-configured. APIs and PostgreSQL perform real work; network/location semantics remain synthetic.

## Local Phase 1

```text
Browser
  ├─ :8081 React mini-order UI ── /api ─┐
  └─ :3000 presenter dashboard ── /api ├─ Node/Fastify ── pooled SQL ── PostgreSQL 16
                                      └─ structured request logs + Server-Timing
Browser ── 127.0.0.1:3001 ── allowlisted local agent ── read-only AWS CLI (operator-triggered)
```

PostgreSQL is reachable only on the Compose network. The backend uses a bounded pool of ten connections and parameterized SQL. Orders contain synthetic references only. Numeric identity keys optimize insert/index locality; public UUIDs are secondary identifiers. Foreign keys and common filter/order paths are indexed.

## Phase 2B-1 planned AWS profiles

| Profile | Compute | Database | Label |
| --- | --- | --- | --- |
| `sg_managed` | EC2 + Docker behind a two-AZ Singapore ALB | Single-AZ RDS PostgreSQL | MANAGED VS SELF-MANAGED |
| `han_baseline` | EC2 + Docker behind a one-subnet Local Zone ALB | PostgreSQL 16 on EC2/EBS gp3 | SELF-MANAGED LOCAL ZONE |
| `hybrid_sg_app_han_db` | Singapore API | private-address Hanoi PostgreSQL | HYBRID |

The current full plan is a cost-conscious architecture comparison, not a fair geography-only baseline: Singapore uses RDS while Hanoi uses self-managed PostgreSQL. RDS is Single-AZ and the Hanoi database is single-instance. CloudFront is not deployed. `/api/*` bypasses Nginx caching. Hanoi ALB subnets and regional ALB subnets are never mixed on one load balancer.

## Data contracts

- `GET /health`: DB-connected health and check timestamp.
- `GET /api/topology`: runtime mode, vantage, DB location, AWS connection state, provenance.
- `GET|POST /api/orders`, `GET /api/orders/:id`: real PostgreSQL order operations.
- `GET /api/benchmark/db?n=1|5|10|20`: sequential real SQL operations with per-query timing.
- `POST /api/benchmark/write`: real insert into `benchmark_events`.
- Agent `GET /actions`, `POST /actions/:id/runs`, `GET /runs/:id`, `GET /runs/:id/events` (SSE).

Benchmark responses are never cached. `Server-Timing` reports app and DB durations measured on one monotonic server clock; browser elapsed time is retained separately.

## Interactive presenter control plane

The dashboard at `http://localhost:3000` talks directly to a trusted host agent at `127.0.0.1:3001`. The agent is deliberately outside the application containers because it must invoke the host PowerShell, Docker CLI, AWS CLI profile and filesystem evidence paths. The optional container agent is diagnostics-only and does not start by default.

```text
Presenter browser
  | HTTPS? no — localhost HTTP only
  | exact Origin + in-memory CSRF token
  v
Loopback Fastify control agent
  |-- fixed action registry (no arbitrary shell)
  |-- strict environment/scenario parameters
  |-- risk and explicit confirmation gate
  |-- exclusive migration/restore locks
  |-- sanitized SSE execution events
  `-- append-only per-run evidence
        |-- real HTTP executors -> selected API -> PostgreSQL
        |-- local PowerShell allowlist -> existing presenter scripts
        `-- read-only AWS CLI -> profile thangvn only
```

AWS endpoints are admitted only from successful sanitized deployment evidence. A selector change updates UI context only; it never runs Terraform, restarts EC2, performs cutover, or changes a database. EBS snapshot and real migration actions have no executor under the current authorization.
