---
title: "What 1,200 Requests Taught Us About AWS Hanoi Local Zone"
description: "Hanoi reduced client latency in one retained experiment, but a Singapore API talking sequentially to Hanoi PostgreSQL turned locality into a latency trap."
publishedAt: 2026-11-13
eyebrow: "Benchmark analysis · Singapore / Hanoi / Hybrid"
readingTime: "12 minute read"
tags:
  - AWS Local Zones
  - PostgreSQL
  - Latency
  - Terraform
featured: true
lang: en
translationSlug: aws-hanoi-local-zone-1200-requests-3-kien-truc
---

A database was moved closer to users in Vietnam. The application became dramatically slower.

That sounds contradictory only if “closer” is treated as a property of one resource. User-visible latency belongs to a path: browser to API, API to database, every synchronous round trip, and the work performed between them.

This lab measured three such paths from a Vietnam-based presenter client:

1. **Singapore:** Vietnam client → Singapore API → Singapore PostgreSQL.
2. **Hanoi:** Vietnam client → Hanoi API → Hanoi PostgreSQL.
3. **Hybrid:** Vietnam client → Singapore API → private Hanoi PostgreSQL.

The retained run completed 1,200 measured HTTP requests with zero recorded errors. Hanoi showed a lower client p50 than Singapore for this workload and client. Hybrid told the more important story: its database p50 grew from **36.365 ms** for one SQL query to **719.100 ms** for twenty sequential queries.

> Moving a data tier closer to the user does not help when the application tier must wait across the new boundary again and again.

## Two machines, three logical architectures

The cost-minimal experiment did not use three stacks of dedicated machines. It used two EC2 instances:

- A Singapore `t3.small` hosted the Singapore API, Hybrid API, and Singapore PostgreSQL.
- A Hanoi Local Zone `c7i.large` hosted the Hanoi API and Hanoi PostgreSQL.

Both used encrypted 30 GiB gp3 root volumes and separate encrypted 10 GiB PostgreSQL volumes. The static React frontend was served from Singapore Regional S3 through a separate delivery path. S3 was never in the direct API-to-database request path.

This distinction matters. An architecture diagram that places S3 between the API and database would explain a system that was never measured.

The shared VPC used private connectivity for the Hybrid API to reach Hanoi PostgreSQL. Database port 5432 was not public. Direct HTTP access to the APIs was restricted to the reviewer's single-host `/32`, not opened to the internet.

The design was intentionally compact and inexpensive. It was not highly available, and the different EC2 types mean this was not a controlled geography-only comparison.

## How the experiment worked

Each benchmark request called a Fastify endpoint that performed real parameterized PostgreSQL queries. The endpoint could execute 1, 5, 10, or 20 queries, always sequentially.

For every scenario and query count, the runner excluded five warm-ups and recorded 100 measured requests at concurrency one. That produced twelve groups and 1,200 retained samples.

The evidence kept several timing layers:

- Client-observed HTTP duration.
- Application duration reported by the server.
- Aggregate database duration.
- Individual SQL query duration.

The application also emitted `Server-Timing`. This made it possible to distinguish time spent inside PostgreSQL from the much larger end-to-end request path.

The variation across HTTP samples is **HTTP latency variation**, not packet-network jitter. A true jitter claim would require a different packet-level method.

## The retained HTTP results

All values below are milliseconds.

| Scenario | Queries | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| Singapore | 1 | 56.656 | 75.634 | 90.293 |
| Singapore | 5 | 57.575 | 67.726 | 82.820 |
| Singapore | 10 | 59.466 | 76.744 | 85.813 |
| Singapore | 20 | 62.014 | 74.901 | 82.713 |
| Hanoi | 1 | 41.905 | 54.821 | 62.327 |
| Hanoi | 5 | 42.102 | 58.067 | 62.187 |
| Hanoi | 10 | 42.380 | 55.750 | 66.291 |
| Hanoi | 20 | 43.939 | 60.929 | 85.005 |
| Hybrid | 1 | 88.298 | 113.306 | 179.807 |
| Hybrid | 5 | 232.332 | 271.749 | 383.806 |
| Hybrid | 10 | 415.634 | 461.378 | 590.547 |
| Hybrid | 20 | 773.487 | 808.463 | 855.794 |

Hanoi's HTTP p50 remained around 42–44 ms across the tested query counts. Singapore remained around 57–62 ms. In this run, from this client path, Hanoi was lower.

That is a useful observation—not a universal performance guarantee. ISP routing, TLS behavior, load, time of day, cache state, and client location can all change the result.

## The Hybrid curve is the result that matters

The database p50 makes the Hybrid behavior unusually clear:

| Scenario | 1 query | 5 queries | 10 queries | 20 queries |
|---|---:|---:|---:|---:|
| Singapore DB p50 | 0.988 | 2.578 | 3.825 | 6.728 |
| Hanoi DB p50 | 0.478 | 1.263 | 1.368 | 2.325 |
| Hybrid DB p50 | 36.365 | 180.164 | 359.563 | 719.100 |

One Hybrid query took about 36 ms at p50. Five took about 180 ms. Ten took about 360 ms. Twenty took about 719 ms.

This was not PostgreSQL suddenly becoming computationally expensive. It was a synchronous application paying a cross-location wait repeatedly. A useful explanatory model is:

> Total response time ≈ client-to-API time + application work + N × cross-location database round-trip cost + variance and protocol overhead.

This is not a fitted formula, and the lab did not invent network-hop timings. It is a way to reason about why chatty synchronous access patterns are sensitive to distance.

## What should an architect change?

The simplest answer is often to colocate a chatty API with its primary database. When that is not possible, the application boundary must change—not merely the database address.

Possible approaches include:

- Batch queries or replace N+1 access patterns.
- Reduce the number of synchronous database interactions per request.
- Cache appropriate read data nearer the API or user.
- Separate read and write paths deliberately.
- Move non-blocking work behind asynchronous messages.
- Redefine service and data ownership so one request does not bounce across locations.
- Use bounded concurrency only when correctness and database capacity permit it.

These are architectural remedies, not features verified by this experiment.

## Local Zone placement is not a residency certificate

The Hanoi scenario placed EC2 compute and encrypted EBS in `ap-southeast-1-han-1a`. That is meaningful placement evidence. It does not prove every byte, copy, log, snapshot, key, package, control-plane record, or operator action remains in Vietnam.

This lab used parent-Region S3 buckets in Singapore for the frontend and application artifact. Snapshot location requires separate validation. Backup, disaster recovery, KMS, logging, AMI distribution, and support workflows each have their own boundaries.

A responsible residency claim requires service-by-service evidence, organizational controls, legal review, and ongoing operational verification.

## The implementation failures were part of the experiment

Several failures improved the lab more than a first-pass success would have.

### The AMI root volume could not shrink

The pinned ECS-optimized Amazon Linux 2023 image used a 30 GiB source snapshot. Terraform accepted a 12 GiB root-volume configuration, but EC2 would not create a snapshot-backed volume smaller than its source. Both encrypted roots were corrected to 30 GiB.

Static validation is useful, but it cannot prove every provider-side constraint.

### A Hanoi zone identifier was not an S3 Region

The first native Hanoi bootstrap derived an invalid S3 hostname from the Local Zone-like identifier. The artifact bucket lived in the parent Singapore Region. Bootstrap was corrected to use the explicit Regional S3 endpoint, verify the artifact SHA-256, and retry with bounded backoff.

Compute placement and service endpoint scope are separate concepts.

### Secret order controlled Hybrid startup

Hanoi PostgreSQL had to initialize its secret before the Singapore Hybrid API could connect. The reviewed dependency creates Hanoi first, publishes the secret only when it has no version, and gives Singapore a bounded wait for the peer value.

### A presenter VPN changed the infrastructure input

API security groups allowed one reviewed presenter `/32`. Cloudflare WARP used shared egress addresses that changed between checks, invalidating the immutable plan. The workflow stopped. It did not widen ingress to a Cloudflare range or `0.0.0.0/0`.

The operator's network path was part of the deployment configuration.

## The browser was never given a shell

The interactive portal can show real operations and timestamped logs, but its local agent binds only to `127.0.0.1`. It uses an exact Origin allowlist, an in-memory CSRF token, a fixed action registry, `shell: false`, and sanitized Server-Sent Events.

Terraform mutation is disabled by default. When deliberately enabled, an approval is bound to the exact saved-plan hash, configuration and artifact fingerprints, AWS account, Region, profile, and deployment identity. It expires, is one-time use, and rejects changed inputs.

Historical evidence cannot promote a deployment to `READY`. Apply success reaches only an infrastructure-deployed state; bootstrap and runtime verification of all three cases are required separately.

## Cleanup was part of the architecture

Both PostgreSQL data volumes used Terraform `prevent_destroy`. The artifact bucket was versioned and did not allow automatic force deletion. Those controls intentionally blocked casual teardown.

A complete cleanup therefore needed an explicit data-retention decision, exact S3 version and delete-marker review, a saved destroy plan, and an independent residual audit. The project ultimately completed its project-scoped 48-resource teardown without using `terraform state rm` to hide resources.

The latest verified state is:

- AWS_REAL: **NOT_DEPLOYED**.
- Project EC2, EBS, Elastic IP, S3, networking, IAM, snapshot, database service, and secret counts: **zero**.
- Active estimated project infrastructure cost: **USD 0/hour**.
- Historical evidence: preserved and labelled historical.

## Five takeaways

1. **Latency belongs to the whole path.** A resource's location is not the application's location.
2. **Sequential remote work multiplies distance.** Query count can matter more than the single-query number.
3. **Placement is narrower than residency.** Verify every service and data lifecycle separately.
4. **Evidence needs provenance.** Local emulation, historical cloud evidence, plans, and live deployments are different states.
5. **Cleanup is an architecture feature.** A lab is not finished until residual cost is independently checked.

The surprising Hybrid curve made the headline. The safer lifecycle, honest limitations, and verified zero-resource ending made the experiment reusable.
