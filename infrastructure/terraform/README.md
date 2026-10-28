# AWS real infrastructure profiles

Three independent Terraform roots preserve the same application contract at different cost/management levels:

| Profile | Terraform root | Purpose |
| --- | --- | --- |
| `smoke_hanoi` | `environments/smoke` | One Hanoi `c7i.large`, encrypted EBS, no inbound access; placement/bootstrap proof only. |
| `cost_minimal` (default) | `environments/cost_minimal` | Singapore `t3.small` + Hanoi `c7i.large`, co-located API/PostgreSQL containers, Singapore S3 frontend, direct CIDR-restricted HTTP APIs. No ALB, RDS, NAT, or interface endpoint. |
| `full_managed` | `environments/full` | Original private EC2 + separate Hanoi DB + Singapore RDS + two ALBs and interface endpoints. |

`cost_minimal` keeps the existing Node.js/Fastify implementation. Hanoi currently offers no C7i size below `c7i.large`; changing language would not reduce the Local Zone instance size.

Build and create a review-only default plan from the repository root:

```powershell
.\infrastructure\terraform\scripts\build-artifacts.ps1
.\infrastructure\terraform\scripts\plan-review.ps1 -PresenterCidr '<YOUR_PUBLIC_IPV4>/32'
```

Review every profile:

```powershell
.\infrastructure\terraform\scripts\build-artifacts.ps1 -Target All
.\infrastructure\terraform\scripts\plan-review.ps1 -Environment All -PresenterCidr '<YOUR_PUBLIC_IPV4>/32'
```

The direct S3 website and APIs use HTTP in `cost_minimal`; only synthetic data is permitted. API ingress rejects `0.0.0.0/0`, database port 5432 is private security-group-to-security-group traffic, and S3 is the only intentionally public bucket. CloudFront is optional and disabled; it should not be enabled for browser use until API TLS is also designed. An optional Hanoi Nginx frontend can be enabled with `enable_hanoi_local_frontend=true`.

Generated archives, plans, and state are ignored by Git. The provider uses profile `thangvn`, Region `ap-southeast-1`, and an STS-derived expected account ID. No review script runs `terraform apply`.
