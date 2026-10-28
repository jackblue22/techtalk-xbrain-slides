# AWS real teardown runbook

No teardown command was executed in Phase 2B-1. Destroying databases, EBS data volumes, snapshots, or versioned artifact objects requires explicit approval separate from deployment approval.

## 1. Inventory and preview

```powershell
aws resourcegroupstaggingapi get-resources --profile thangvn --region ap-southeast-1 --tag-filters Key=Project,Values=hanoi-lz-live-demo
.\infrastructure\terraform\scripts\teardown-preview.ps1 -Environment Smoke
.\infrastructure\terraform\scripts\teardown-preview.ps1 -Environment CostMinimal -PresenterCidr '<YOUR_PUBLIC_IPV4>/32'
.\infrastructure\terraform\scripts\teardown-preview.ps1 -Environment Full
```

The preview is expected to stop on retained-data safeguards until an operator decides what to preserve. It never applies the destroy plan.

Also inventory independently:

```powershell
aws ec2 describe-instances --profile thangvn --region ap-southeast-1 --filters Name=tag:Project,Values=hanoi-lz-live-demo
aws ec2 describe-volumes --profile thangvn --region ap-southeast-1 --filters Name=tag:Project,Values=hanoi-lz-live-demo
aws ec2 describe-snapshots --profile thangvn --region ap-southeast-1 --owner-ids self --filters Name=tag:Project,Values=hanoi-lz-live-demo
aws rds describe-db-instances --profile thangvn --region ap-southeast-1
aws rds describe-db-snapshots --profile thangvn --region ap-southeast-1 --snapshot-type manual
aws elbv2 describe-load-balancers --profile thangvn --region ap-southeast-1
```

## 2. Decide retained data explicitly

Before changing safeguards, record one of these decisions for every data resource:

- Hanoi smoke gp3 volume: retain or delete.
- Cost-minimal Singapore and Hanoi PostgreSQL gp3 volumes: retain, snapshot then delete, or delete.
- Cost-minimal Elastic IPs: release immediately after the demo; allocated addresses continue to bill even if EC2 is stopped.
- Cost-minimal public frontend and private artifact S3 buckets: empty exact object versions or retain with an owner/expiry decision.
- Cost-minimal Secrets Manager secrets: schedule deletion or retain with an expiry decision.
- Hanoi PostgreSQL gp3 volume: retain, snapshot then delete, or delete.
- Singapore RDS: retain, create/verify final snapshot then delete, or delete without retention only when explicitly approved.
- Existing EBS/RDS snapshots: retain or delete by exact ID.
- Versioned S3 artifact objects: retain or delete.

Retained EBS volumes, RDS instances, snapshots, active Secrets Manager secrets, and S3 objects continue to accrue charges. AWS does not charge for a secret after it is scheduled for deletion, including during its recovery window; verify that deletion was actually scheduled rather than merely planned.

## 3. Safeguards that must not be bypassed casually

- Smoke and Hanoi database data volumes use Terraform `prevent_destroy`.
- RDS uses both `prevent_destroy` and AWS deletion protection and requires a final snapshot.
- Both ALBs use AWS deletion protection.
- Artifact buckets have `force_destroy=false` and versioning enabled.

A full teardown therefore requires a small, reviewed Terraform source diff that deliberately removes `prevent_destroy`, disables RDS/ALB deletion protection, and specifies the approved data outcome. Apply only the protection-setting change first, then create a new destroy plan. Do not combine an unreviewed protection change with destruction.

If a volume must be retained outside Terraform, document its exact ID and AZ, remove the attachment/volume from Terraform state only after a reviewed source change stops declaring them, and confirm the instance termination detached it. `terraform state rm` does not delete AWS data, but using it incorrectly can orphan billable resources.

For versioned artifact buckets, list all versions before any deletion. Prefer a reviewed lifecycle/cleanup operation; do not use a broad recursive S3 delete without confirming the exact bucket name from Terraform state.

## 4. Final destroy approval

After protection changes are applied and a new plan is reviewed:

```powershell
cd infrastructure\terraform\environments\<smoke-or-cost_minimal-or-full>
terraform plan -destroy -input=false -lock=false -out=approved-destroy.tfplan
terraform show -no-color approved-destroy.tfplan
# STOP: obtain explicit approval for this exact destroy plan.
# terraform apply approved-destroy.tfplan
```

The commented apply command was not run. Never substitute `terraform destroy -auto-approve`.

## 5. Post-teardown proof

Repeat the inventory commands and verify:

- zero running/stopped EC2 instances with the project tag;
- zero ALBs and target groups from the environment;
- zero interface endpoints, public IPv4 addresses, and NAT gateways from the environment;
- the intended RDS outcome and exact final snapshot status;
- only explicitly retained EBS volumes/snapshots remain;
- no unintended S3 object versions or Secrets Manager secrets remain;
- retained resources have an owner, reason, expiry date, and estimated monthly cost.

Local Zone opt-in is an account setting and is not altered by Terraform teardown.
