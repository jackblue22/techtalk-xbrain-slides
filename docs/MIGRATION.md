# Migration Design (Phase 4 — Not Executed)

The future SG → Hanoi migration is maintenance-window based: preflight, deterministic source evidence, write freeze, `pg_dump -Fc`, authenticated transfer, `pg_restore`, row-count/sample-ID/content-checksum validation, endpoint cutover, a post-cutover write, and source-only/target-only verification.

Rollback returns the application endpoint to Singapore and reopens writes only after the operator determines whether target-side writes must be reconciled. Actual command exit codes and step durations will determine reported downtime, RPO, and RTO. None are claimed in Phase 1. DMS/CDC is optional and never described as already implemented.

