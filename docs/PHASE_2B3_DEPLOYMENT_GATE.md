# Phase 2B-3 controlled deployment gate

Status date: 2026-10-28. **STOPPED BEFORE APPLY. No AWS resource was created, changed, or destroyed.**

This gate applies only to `infrastructure/terraform/environments/cost_minimal` with AWS profile `thangvn` in `ap-southeast-1`. Approval of any previous reconstruction, account upgrade, smoke profile, or full-managed profile does not authorize this deployment.

## Identity, access, quota, and placement

- AWS CLI authentication succeeded through the configured SSO/assumed-role credentials. The verified account ends in `7667`; compare the full account ID locally with `TF_VAR_expected_account_id` without publishing it.
- `ap-southeast-1-han-1a` is `available` and `opted-in`; its network border group is `ap-southeast-1-han-1`.
- `c7i.large` is currently offered in the Hanoi Local Zone. Offerings do not reserve capacity, so launch can still fail.
- Standard On-Demand EC2 quota is 16 vCPUs; this plan requires 4. Elastic IP quota is 5; the current tagged lab inventory is zero and this plan requires 2.
- The reviewed presenter ingress is `171.225.185.86/32`. Recreate the plan instead of applying it if the operator's public IPv4 changes.
- A representative IAM policy simulation returned allowed for the required EC2, EBS, EIP, VPC, IAM, S3, SSM, and Secrets Manager operations. This does not override an organization SCP, capacity error, or a runtime AWS denial.

## Exact saved plan

- Plan: `infrastructure/terraform/environments/cost_minimal/phase2b2-cost_minimal.tfplan`
- SHA-256: `0b8f96c6ad2cb401c6a7a4f8543970a92fdb5c4d359314acc293fd5bd2e8574a`
- Size: 25,497 bytes
- Terraform result: **48 add, 0 change, 0 destroy**
- Application artifact: `infrastructure/terraform/artifacts/minimal-images.tar`
- Artifact SHA-256: `5ed9306375ab7e0cb66d7166db4222ef37d3b0e4c7d0aaf2c238fd6b0402c31f`

Do not apply if either hash, Terraform source, provider lock file, account, presenter IP, quota, or plan output differs.

| Terraform type | Count |
| --- | ---: |
| EC2 instance / EIP / encrypted data EBS volume / attachment | 2 each |
| IAM role / instance profile / inline policy / managed-policy attachment | 2 each |
| S3 bucket / bucket policy / public-access-block / encryption config | 2 each |
| S3 object | 5 |
| Secrets Manager secret | 2 |
| VPC / Internet Gateway / workload security group / S3 gateway endpoint | 1 each |
| Subnet / route table / association | 2 each |
| Security-group ingress / egress rules | 2 / 1 |
| S3 website config / ownership controls / versioning | 1 each |
| Terraform safety gate | 1 |
| ALB / RDS / NAT Gateway / ECS / EKS / interface endpoint / ElastiCache | **0** |

## Compute, storage, and exposure

| Location | Compute | Root | PostgreSQL data | Public address |
| --- | --- | --- | --- | --- |
| Singapore `ap-southeast-1a` | `t3.small`, CPU credits `standard` | encrypted gp3, 12 GiB | encrypted gp3, 10 GiB, `prevent_destroy` | EIP in `ap-southeast-1` |
| Hanoi `ap-southeast-1-han-1a` | `c7i.large` | encrypted gp3, 12 GiB | encrypted gp3, 10 GiB, `prevent_destroy` | EIP in `ap-southeast-1-han-1` |

- EC2 IMDSv2 is required with hop limit 1.
- API ports 8080–8081 are reachable only from `171.225.185.86/32`; no world-open ingress is planned.
- PostgreSQL 5432 is allowed only between members of the shared workload security group over private VPC addresses. It is not publicly exposed.
- The artifact bucket is private, encrypted, versioned, and readable by the two scoped instance roles. The S3 gateway endpoint has no hourly endpoint charge.
- The Singapore frontend bucket is deliberately public-readable because S3 website endpoints require public content. Its website endpoint is HTTP only and globally reachable.
- Both APIs are HTTP only. The current HTTP S3 website can call them, subject to the presenter IP rule. Serving the frontend over HTTPS while leaving the APIs on HTTP causes browser mixed-content blocking; CloudFront remains disabled.
- Hosts require outbound internet/AWS API access during bootstrap. No NAT Gateway or paid interface endpoint is planned.

## Cost gate

Estimated fixed cost is **$0.14735/hour**, approximately **$1.18 for 8 hours**, excluding tax. The major rates are Hanoi `c7i.large` $0.1029/hour, Singapore `t3.small` $0.0264/hour, two public IPv4 addresses $0.01/hour total, 44 GiB gp3 about $0.00694/hour, two secrets about $0.00110/hour, and negligible S3 storage.

Usage-dependent charges excluded from the fixed total include Singapore↔Hanoi Local Zone transfer, internet egress, S3 and Secrets Manager requests, and separately approved snapshots. T3 is pinned to Standard credit mode, so Unlimited surplus-credit charges are excluded; CPU throttling is possible and must be recorded in benchmark evidence.

Stopping EC2 does not stop EIP, EBS, S3, or active-secret charges. If retained, each EIP costs $0.005/hour. The two protected 10 GiB data volumes cost about $1.344/month in Hanoi and $0.96/month in Singapore. Root volumes normally delete with the instances. Scheduling a Secrets Manager secret for deletion stops its charge during the recovery window.

## Apply, verification, recovery, and teardown

After explicit approval, apply only the saved plan above. If Terraform reports a stale plan, a changed hash, a capacity error, or any resource difference, stop; do not substitute another instance type or profile.

Post-apply verification must prove actual instance IDs and AZs, EIP network border groups, encrypted EBS placement, container/PostgreSQL health, migrations and seed rows, real CRUD, private Singapore-to-Hanoi PostgreSQL access, S3 delivery, browser behavior, dashboard connectivity, and sanitized AWS evidence before benchmarks run.

For recovery, use SSM to inspect cloud-init/container logs; do not rerun Terraform with changed scope. A failed launch or bootstrap is a stop condition requiring a new diagnosis and, if the plan changes, a new approval.

Teardown is a separate approval. First inventory and generate a destroy preview using `docs/AWS_REAL_TEARDOWN_RUNBOOK.md`. The protected data volumes intentionally make an ordinary destroy preview fail until their retain/delete outcome is reviewed. Versioned/non-empty S3 buckets also require an exact cleanup decision. Never run `terraform destroy -auto-approve`, and do not create snapshots or perform recovery tests without separate authorization.
