# AWS real `cost_minimal` teardown runbook

Status date: 2026-10-29. This runbook prepares a temporary one-hour lab cleanup. **It does not authorize or execute stop, terminate, release, delete, snapshot, state removal, Terraform apply, or Terraform destroy operations.** Every lifecycle mutation requires a separate explicit approval.

The only permitted scope is AWS profile `thangvn`, account suffix `7667`, Region `ap-southeast-1`, and resources carrying both `Project=hanoi-lz-live-demo` and `Environment=cost_minimal`. Never act on a name match alone, an untagged resource, `smoke_hanoi`, `full_managed`, or another account/Region.

## 1. Audit of all 48 planned resources

| Planned group | Count | Billing while retained | Normal deletion behavior and blocker |
| --- | ---: | --- | --- |
| EC2 instances | 2 | `c7i.large` $0.1029/hour and `t3.small` $0.0264/hour while pending/running | Terraform termination deletes each 30-GiB root because `delete_on_termination=true`. Stopping does not delete or unmanage the instances. |
| Elastic IPs | 2 | $0.005/hour each while allocated, including while EC2 is stopped | Released by the approved Terraform destroy. Confirm both allocation IDs disappear. |
| Separate PostgreSQL gp3 volumes | 2 | Hanoi 10 GiB at $1.344/month; Singapore 10 GiB at $0.96/month | **Hard blocker:** both have `prevent_destroy=true`. A reviewed source change and explicit synthetic-data deletion decision are required. |
| EBS attachments | 2 | No separate charge | Removed with the approved instance/volume teardown; never force-detach automatically. |
| IAM roles, profiles, inline policies, SSM attachments | 8 | No direct hourly charge | Terraform removes them after dependent instances. IAM propagation can delay deletion but is not a retention strategy. |
| VPC, Internet Gateway, subnets, route tables, associations | 8 | No direct hourly charge | Dependency-ordered Terraform deletion after instances, EIPs, and endpoints. |
| Workload security group and rules | 4 | No direct hourly charge | One SG, two ingress rules, one egress rule; ENI dependencies must be gone first. |
| S3 gateway endpoint | 1 | No hourly endpoint charge | Deleted after route-table dependencies. It is not a paid interface endpoint. |
| S3 buckets and supporting resources | 16 | S3 bytes and requests remain billable | **Hard blocker:** both buckets use `force_destroy=false`. The artifact bucket is versioned; all versions and delete markers must be removed explicitly. |
| Secrets Manager secrets | 2 | $0.40/secret-month while active | Terraform schedules seven-day deletion. A secret pending deletion is reported as retained but has zero estimated storage charge during the recovery window. |
| Terraform safety gate | 1 | No AWS charge | Local Terraform bookkeeping only. |
| **Total** | **48** | | **48 create, 0 change, 0 destroy in the approved deployment plan.** |

The two 30-GiB root EBS volumes are embedded in the EC2 resources rather than separate Terraform resource addresses. Including roots and data volumes, retained gp3 storage is 80 GiB: about $9.216/month or $0.01262/hour-equivalent. No snapshot is planned; any project-tagged snapshot is unexpected until separately authorized.

The 48 resources contain no ALB, RDS, NAT Gateway, paid interface endpoint, ECS service, EKS, or ElastiCache resource.

## 2. Read-only teardown preview and residual-cost report

Run from the repository root before any stop or cleanup request:

```powershell
.\infrastructure\terraform\scripts\teardown-preview.ps1 `
  -Environment CostMinimal `
  -PresenterCidr '14.224.239.90/32' `
  -Profile thangvn `
  -ExpectedAccountSuffix '7667' `
  -OutputPath .\evidence\aws-teardown-preview-latest.json
```

The script uses only identity, Terraform refresh/plan, tagging, describe, list, and S3 version-list operations. It deliberately does not save an applicable destroy plan. It fails closed if an EC2, EBS, EIP, S3, snapshot, or secret record lacks either required scope tag.

The JSON report contains:

- Terraform state addresses and the read-only destroy-preview exit/summary;
- exact instance, EIP, volume, snapshot, bucket, object-version, delete-marker, and secret identifiers;
- current and post-stop hourly-equivalent residual costs;
- the three known destroy blockers;
- post-cleanup assertions that must all be reconciled.

Before cleanup, preserve the report and separately record its two secret ARNs. They are needed to verify pending-deletion status after Terraform state no longer contains the secrets.

## 3. One-hour timeline and two-phase cleanup

### Phase 1 — stop chargeable compute first

At approximately minute 50, run the read-only preview and request explicit approval to stop only the two instance IDs listed under `inventory.instances`. After approval, the operator may use an exact-ID command such as:

```powershell
# MUTATING — do not run without explicit stop approval for both exact IDs.
aws ec2 stop-instances --profile thangvn --region ap-southeast-1 --instance-ids <SINGAPORE_INSTANCE_ID> <HANOI_INSTANCE_ID>
aws ec2 wait instance-stopped --profile thangvn --region ap-southeast-1 --instance-ids <SINGAPORE_INSTANCE_ID> <HANOI_INSTANCE_ID>
```

Re-run the read-only report. Both instances must show `stopped`. This removes EC2 compute charges but is not teardown: two EIPs, 80 GiB EBS, two active secrets, and S3 storage continue billing. The expected stopped-lab residual is about **$0.02373/hour-equivalent**, excluding requests and transfer.

Do not stop by tag-expanded command without first reviewing the exact IDs. Do not terminate instances manually; Terraform must retain ownership of the lifecycle.

### Phase 2 — separately approved permanent cleanup

Permanent cleanup requires a new approval covering synthetic PostgreSQL data, both verified S3 buckets, secrets, EIPs, instances, and networking. Prepare it in this order:

1. Preserve the pre-cleanup report, Terraform state backup, plan/hash evidence, benchmark evidence, exact volume IDs, exact bucket names, and exact secret ARNs. Do not copy secret values.
2. Decide that both 10-GiB PostgreSQL volumes may be deleted. Make a narrowly reviewed Terraform source change removing only their `prevent_destroy` lifecycle guards. Do not use `terraform state rm`.
3. Re-list both verified bucket names and all object versions/delete markers. Obtain separate destructive approval for those exact identifiers. The artifact bucket requires deletion of every version and delete marker—not merely current keys. The frontend bucket must also be confirmed empty even though Terraform did not enable versioning there.
4. After approved bucket content cleanup, generate a fresh `terraform plan -destroy -out=<reviewed-name>.tfplan`. Review every address, calculate its SHA-256, and obtain explicit approval for that exact destroy plan.
5. Apply only the approved destroy plan. Do not substitute `terraform destroy -auto-approve`, direct EC2 termination, manual EIP release, or state removal.
6. Terraform should terminate both EC2 instances, delete the four EBS volumes, release both EIPs, remove IAM/network/S3 resources, and schedule both secrets for seven-day deletion. Any failure stops the workflow; inventory and cost-report the partial state before further action.

Deleting S3 versions and removing `prevent_destroy` are destructive preparation steps and are not authorized by deployment approval. Snapshot creation is also excluded unless separately approved.

## 4. Post-cleanup proof

Run the preview again, passing the secret ARNs captured before cleanup:

```powershell
.\infrastructure\terraform\scripts\teardown-preview.ps1 `
  -Environment CostMinimal `
  -PresenterCidr '14.224.239.90/32' `
  -Profile thangvn `
  -ExpectedAccountSuffix '7667' `
  -KnownSecretArn '<SINGAPORE_SECRET_ARN>','<HANOI_SECRET_ARN>' `
  -OutputPath .\evidence\aws-teardown-postcheck.json
```

The cleanup report must explicitly reconcile:

- zero project-tagged EC2 instances in pending/running/stopping/stopped/shutting-down states;
- zero project-tagged EIP allocations;
- zero project-tagged EBS volumes, unless each retained volume has explicit approval, owner, expiry, and monthly cost;
- both known bucket names absent, with zero object versions and delete markers verified before deletion;
- zero unexpected project-tagged EBS snapshots;
- both secrets either absent or `pendingDeletion=true`; pending-deletion secrets remain visible during recovery but are estimated at $0 storage charge;
- Terraform state consistent with AWS, with no address removed merely to conceal retained infrastructure.

If any resource remains, the final report must list its exact identifier, state, reason, owner, expiry, and estimated hourly/monthly charge. A non-zero residual report is acceptable; an unreported residual is not.

## 5. Failure rules

- If account, Region, project tag, environment tag, or resource identity differs, stop and request new scope approval.
- If the destroy preview is blocked by `prevent_destroy`, treat that as the expected safeguard—not a reason to bypass Terraform.
- If a versioned bucket is nonempty, do not set `force_destroy=true` merely for convenience; review and delete exact versions within scope.
- If destroy partially fails, do not retry blindly. Re-run inventory, preserve state, report billable residuals, and request approval for the next exact action.
- Never use `terraform state rm` as cleanup. State removal does not delete AWS resources and can hide ongoing charges.
- Never delete an untagged or differently tagged resource, even if its name resembles the lab.

Local Zone opt-in is an account setting and is not altered by lab teardown.
