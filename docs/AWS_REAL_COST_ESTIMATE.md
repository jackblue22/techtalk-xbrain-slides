# AWS real lab cost estimate

Price check date: 2026-10-28. Currency: USD, excluding tax. The account's Paid Plan does not make these resources free.

Prices below were queried from the official AWS Price List API for the exact locations and SKUs in the saved plans. Public IPv4, Secrets Manager, PrivateLink behavior, and Local Zone pricing caveats are cross-checked against the [VPC pricing page](https://aws.amazon.com/vpc/pricing/), [Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/), [PrivateLink pricing](https://aws.amazon.com/privatelink/pricing/), and [Local Zones pricing](https://aws.amazon.com/about-aws/global-infrastructure/localzones/pricing/).

## Minimal Hanoi smoke test

| Item | Planned quantity | Verified rate | Estimated hourly |
| --- | ---: | ---: | ---: |
| Hanoi `c7i.large` Linux On-Demand | 1 | $0.1029/hour | $0.102900 |
| Hanoi gp3, 12 GiB root + 10 GiB retained data | 22 GiB | $0.1344/GiB-month | $0.004050 |
| Public IPv4 for outbound-only smoke instance | 1 | $0.005/hour | $0.005000 |
| S3 Standard artifact, about 0.0023 GB | 1 object | $0.025/GB-month | <$0.000001 |
| NAT Gateway, ALB, RDS, interface endpoints | 0 | — | $0 |
| **Estimated total** | | | **$0.11195/hour** |

| Runtime | Estimate |
| ---: | ---: |
| 4 hours | **$0.45** |
| 8 hours | **$0.90** |
| 24 hours | **$2.69** |

The separate 10 GiB gp3 data volume has `prevent_destroy`; it continues to accrue about **$1.344/month** if retained after the instance is removed.

## Default `cost_minimal` two-location lab

This profile uses the same Node.js/Fastify API in both locations and co-locates PostgreSQL on each EC2 host. It has no ALB, RDS, NAT Gateway, or hourly interface endpoint.

| Item | Planned quantity | Verified rate | Estimated hourly |
| --- | ---: | ---: | ---: |
| Hanoi `c7i.large`, 2 vCPU / 4 GiB | 1 | $0.1029/hour | $0.102900 |
| Singapore `t3.small`, 2 vCPU / 2 GiB | 1 | $0.0264/hour | $0.026400 |
| Hanoi gp3, 12 GiB root + 10 GiB data | 22 GiB | $0.1344/GiB-month | $0.004050 |
| Singapore gp3, 12 GiB root + 10 GiB data | 22 GiB | $0.096/GiB-month | $0.002893 |
| Public IPv4 / Elastic IP while allocated | 2 | $0.005/hour | $0.010000 |
| Secrets Manager | 2 secrets | $0.40/secret-month | $0.001096 |
| S3 artifact (~0.22 GB) + static frontend | 2 buckets | $0.025/GB-month plus requests | ~$0.000009 |
| S3 gateway endpoint, Internet Gateway | 1 each | no hourly charge | $0 |
| ALB, RDS, NAT, interface endpoints, CloudFront | 0 | — | $0 |
| **Estimated fixed total** | | | **$0.14735/hour** |

| Runtime | Estimate |
| ---: | ---: |
| 4 hours | **$0.59** |
| 8 hours | **$1.18** |
| 24 hours | **$3.54** |

This is about 70% below the fixed hourly estimate for `full_managed`. Cross-location transfer, internet egress, S3 requests, Secrets Manager API calls, and optional snapshots remain usage-dependent. Direct S3 website and API delivery are HTTP; CloudFront is disabled by default and has no fixed distribution-hour fee, but data transfer and requests are billable when enabled.

The Singapore `t3.small` is explicitly configured in **Standard** credit mode. This prevents T3 Unlimited surplus-credit charges, but Standard mode provides no launch credits and can throttle CPU to its earned-credit baseline after the balance is depleted. Capture `CPUCreditBalance` before and after each real benchmark and do not interpret a throttled `t3.small` versus `c7i.large` result as a geography-only comparison.

## Full Singapore + Hanoi lab

| Item | Planned quantity | Verified rate | Estimated hourly |
| --- | ---: | ---: | ---: |
| Hanoi app `c7i.large` | 1 | $0.1029/hour | $0.102900 |
| Hanoi DB `m7i.large` | 1 | $0.1260/hour | $0.126000 |
| Singapore app `t3.small` | 1 | $0.0264/hour | $0.026400 |
| Singapore RDS PostgreSQL `db.t4g.micro`, Single-AZ | 1 | $0.0250/hour | $0.025000 |
| Hanoi gp3: two 20 GiB roots + 30 GiB data | 70 GiB | $0.1344/GiB-month | $0.012888 |
| Singapore EC2 gp3 root | 20 GiB | $0.096/GiB-month | $0.002630 |
| Singapore RDS gp3 | 20 GiB | $0.138/GiB-month | $0.003781 |
| Singapore ALB | 1 | $0.0252/hour | $0.025200 |
| Hanoi Local Zone ALB | 1 | $0.0775/hour | $0.077500 |
| ALB capacity, conservative assumption | 1 LCU each | SG $0.008 + Hanoi $0.0125/LCU-hour | $0.020500 |
| Interface endpoints: SSM, messages ×2, Secrets Manager | 4 endpoint ENIs in one AZ | $0.013/hour each | $0.052000 |
| Public IPv4 used by ALB nodes | 3 | $0.005/hour | $0.015000 |
| Secrets Manager | 2 secrets | approximately $0.00056/secret-hour | $0.001120 |
| S3 Standard artifact, about 0.222 GB | 1 object | $0.025/GB-month | $0.000008 |
| NAT Gateway / Elastic IP | 0 | — | $0 |
| **Estimated total** | | | **$0.49093/hour** |

| Runtime | Estimate |
| ---: | ---: |
| 4 hours | **$1.96** |
| 8 hours | **$3.93** |
| 24 hours | **$11.78** |

## Variable and uncertain charges

- LCU usage depends on connections, bytes, rule evaluations, and traffic. The table assumes one LCU on each ALB; actual usage can be lower or higher.
- Interface endpoint data processing is $0.01/GB for the first PB. S3 gateway endpoints have no hourly endpoint charge.
- Singapore↔Hanoi Local Zone and internet data transfer are usage-dependent and excluded from the fixed totals. AWS states that Local Zone data transfer uses Local Zone-specific rates; Cost Explorer must be checked after the first controlled run.
- RDS T4g Unlimited CPU credits can add $0.075/vCPU-hour when sustained use exceeds the baseline.
- The `cost_minimal` T3 instance does not incur Unlimited surplus-credit charges because it is pinned to Standard mode; CPU throttling remains a benchmark variable.
- Secrets Manager API requests, S3 requests, and CloudWatch log ingestion are expected to be cents or less for a short lab but are not treated as zero.
- EBS snapshot storage is incremental. The Price List API returned Hanoi `HAN1-EBS:SnapshotUsage` at $0.07/GB-month but with an inconsistent product-description city, so the rate is recorded as **catalog value requiring billing confirmation**, not included above. Singapore regional snapshot storage is $0.05/GB-month.
- RDS automated backup storage up to the provisioned database size is normally included while the DB is active; retained final snapshots after deletion are separately billable.
- Estimates use 730 hours/month to prorate storage. Actual billing granularity, credits, currency conversion, and tax can differ.

## Profile comparison

| Profile | 4 hours | 8 hours | 24 hours | Primary proof |
| --- | ---: | ---: | ---: | --- |
| `smoke_hanoi` | $0.45 | $0.90 | $2.69 | Hanoi placement, encrypted EBS, bootstrap |
| `cost_minimal` (default) | $0.59 | $1.18 | $3.54 | Two real locations, three API/DB paths, migration/backup-capable PostgreSQL |
| `full_managed` | $1.96 | $3.93 | $11.78 | ALB/RDS/private managed architecture |

The read-only Free Tier API returned account plan `PAID`, status `ACTIVE`, and account-plan remaining credits `$0.00`. This does not rule out a separate promotional credit ledger: the installed AWS CLI 2.34.41 does not expose the newer Billing `get-credits` operation, so the Billing console Credits page remains the authoritative manual check. No credit is assumed or used to reduce these estimates.
