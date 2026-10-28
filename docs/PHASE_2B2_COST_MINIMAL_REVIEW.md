# Phase 2B-2 cost-minimal review

Status date: 2026-10-28. **No Terraform apply was run and no AWS resource was created, changed, or destroyed.**

## Decision

`cost_minimal` is now the default real-AWS profile. The existing Node.js/Fastify backend remains the comparison runtime in Singapore and Hanoi. Live read-only AWS discovery returned `c7i.large`, `m7i.large`, and `r7i.large` as the smallest offered C7i/M7i/R7i sizes in `ap-southeast-1-han-1a`; their exact Hanoi Linux On-Demand rates were $0.1029, $0.1260, and $0.1596/hour. `c7i.large` is therefore the least-cost candidate and provides 2 vCPU/4 GiB.

AWS profile `thangvn` authenticated through an assumed role, the zone returned `opted-in`, and the Standard On-Demand quota returned 16 vCPUs. `cost_minimal` needs 4 vCPUs. Instance offerings are inventory, not a capacity reservation; apply can still fail with insufficient capacity. AWS documents `describe-instance-type-offerings` as the correct AZ/Local Zone discovery API: [EC2 instance type discovery](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/instance-discovery.html).

The read-only Free Tier API returned `PAID` / `ACTIVE` with `$0.00` account-plan remaining credits. The installed CLI does not expose the newer Billing credit-ledger read operation, so no separate promotional balance is inferred and no credit discount is used in the estimate.

## Architecture

```text
Presenter browser
  |-- HTTP -> Singapore S3 general-purpose bucket (static React/Vite)
  |-- HTTP :8080 -> Singapore EIP -> t3.small
  |                     |-- Node/Fastify API
  |                     `-- PostgreSQL 16 on encrypted 10 GiB gp3
  |-- HTTP :8081 -> same Singapore API -> private VPC -> Hanoi PostgreSQL
  `-- HTTP :8080 -> Hanoi EIP -> c7i.large in ap-southeast-1-han-1a
                        |-- same Node/Fastify API
                        `-- PostgreSQL 16 on encrypted 10 GiB gp3
```

The frontend runtime selector exposes Singapore, Hanoi, and hybrid API endpoints without rebuilding React. API CORS is an exact runtime allowlist. API security-group ingress is restricted to a reviewed presenter `/32`; `0.0.0.0/0` is rejected by Terraform validation. Port 5432 is reachable only from the shared workload security group over private VPC addresses. Secrets are generated on each host and written to pre-created Secrets Manager secrets; they are absent from Git, Terraform variables, outputs, and user data.

Direct S3 website hosting is intentionally public HTTP. AWS states that S3 website endpoints require public-readable content and do not support HTTPS: [S3 website endpoints](https://docs.aws.amazon.com/AmazonS3/latest/userguide/WebsiteEndpoints.html). CloudFront/OAC resources are optional and disabled; AWS requires a regular S3 REST origin for OAC, which the optional path uses: [restrict S3 origin access](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html). Browser use of CloudFront remains blocked operationally until the API also has TLS, because HTTPS pages cannot safely call the profile's HTTP APIs.

## Plan evidence

All profiles were initialized, formatted, validated, and planned with AWS provider v6.70.0:

| Profile | Add | Change | Destroy | Saved plan |
| --- | ---: | ---: | ---: | --- |
| `smoke_hanoi` | 22 | 0 | 0 | `environments/smoke/phase2b2-smoke.tfplan` |
| `cost_minimal` | 48 | 0 | 0 | `environments/cost_minimal/phase2b2-cost_minimal.tfplan` |
| `full_managed` | 87 | 0 | 0 | `environments/full/phase2b2-full.tfplan` |

The `cost_minimal` plan contains 2 EC2, 2 EIP, 2 protected data EBS volumes, 2 public subnets, 2 S3 buckets, 2 Secrets Manager secrets, one free S3 gateway endpoint, and IAM/network support. It contains zero ALB, RDS, NAT Gateway, interface endpoint, ECS, EKS, or ElastiCache resources. One S3 bucket is private/versioned for artifacts; one is public only for the static website. The saved plan restricts API ingress to the presenter IP observed during planning and must be regenerated if that IP changes.

The regenerated Phase 2B-3 gate explicitly allocates the Hanoi EIP in network border group `ap-southeast-1-han-1` and the Singapore EIP in `ap-southeast-1`. Terraform preconditions reject an unexpected zone/network-border-group mapping. The Singapore `t3.small` is explicitly in CPU credit mode `standard`; this avoids Unlimited surplus-credit charges but can throttle after earned credits are exhausted.

## Five scenario capability

1. Singapore API + Singapore PostgreSQL: port 8080 on Singapore.
2. Hanoi API + Hanoi PostgreSQL: port 8080 on Hanoi.
3. Singapore API + Hanoi PostgreSQL: port 8081 on Singapore, private VPC database path.
4. Singapore-to-Hanoi logical migration: real `pg_dump -Fc`/`pg_restore` can run between the two hosts with row counts, checksums, and samples validated before cutover.
5. Logical backup/restore: real PostgreSQL backup and isolated restore can be executed. A separately approved EBS Local Snapshot test is still required to prove snapshot semantics; logical backup does not prove them.

The optional Hanoi Nginx frontend is disabled by default and can be enabled with `enable_hanoi_local_frontend=true` in a newly reviewed plan. It does not create another EC2 instance.

## Limits and gates

- Nothing has been deployed; there are no real endpoints, resource IDs, placement proof, cloud HTTP samples, or AWS latency results yet.
- Direct HTTP is suitable only for synthetic demo records. TLS requires a separately reviewed connectivity design.
- Co-location creates compute and I/O contention. This profile demonstrates genuine paths and operations, not production HA or a perfectly controlled geography-only experiment.
- EC2 stop does not eliminate EBS, Elastic IP, S3, secret, or snapshot costs. Elastic IPs should be released at teardown.
- S3 account-level Public Access Block was read-only checked and no account-level configuration was present. Deployment does not change account settings.
- Apply remains stopped pending review of the exact saved plan, estimate, exposure, and teardown procedure.
