# AWS real deployment runbook

This runbook contains charge-incurring commands for a future explicitly approved window. They are **documented but have not been executed**. `cost_minimal` is the default profile.

## 1. Preflight and immutable artifacts

Run from the repository root:

```powershell
aws sts get-caller-identity --profile thangvn
.\scripts\preflight\aws-readonly.ps1 -Profile thangvn
aws service-quotas get-service-quota --profile thangvn --region ap-southeast-1 --service-code ec2 --quota-code L-1216C47A
.\infrastructure\terraform\scripts\build-artifacts.ps1
.\infrastructure\terraform\scripts\plan-review.ps1 -PresenterCidr '<YOUR_PUBLIC_IPV4>/32'
terraform fmt -check -recursive infrastructure/terraform
```

Expected reviewed artifact hashes for the 2026-10-28 plans:

- `smoke-images.tar`: SHA-256 `868453aa565a1290b61cd613327097005aae2ab6e4f62fa6cbd0f81c749c66ba`
- `minimal-images.tar`: SHA-256 `5ed9306375ab7e0cb66d7166db4222ef37d3b0e4c7d0aaf2c238fd6b0402c31f`
- `full-images.tar`: SHA-256 `07e45da77c68940f7af8d201e63cfdec6cc67416b3ce3a0227124bb8d8306fa5`

If either archive, Terraform source, provider lock file, account, quota, or plan changes, discard the saved plan and repeat review. Never apply a stale plan.

## 2. Default cost-minimal deployment

Before approval, confirm the plan contains two EC2 instances, two Elastic IPs, two encrypted data EBS volumes, two private database secrets, one private artifact bucket, and one public Singapore static-website bucket. It must contain **zero** ALB, RDS, NAT Gateway, ECS, EKS, or interface endpoint resources. Confirm API ingress is only the presenter `/32`, never `0.0.0.0/0`.

Only after explicit approval of the exact saved plan:

```powershell
cd infrastructure\terraform\environments\cost_minimal
$env:TF_VAR_expected_account_id = aws sts get-caller-identity --profile thangvn --query Account --output text
$env:TF_VAR_benchmark_client_cidrs = '["<YOUR_PUBLIC_IPV4>/32"]'
terraform show -no-color phase2b2-cost_minimal.tfplan
# STOP here until the displayed plan is explicitly approved.
terraform apply phase2b2-cost_minimal.tfplan
cd ..\..\..\..
.\infrastructure\terraform\scripts\verify-cost-minimal.ps1
```

The final `terraform apply` line is a future operator command; it was not run while preparing this plan. Verification checks both instance placements, encrypted gp3 volumes, S3 frontend, topology provenance, CRUD, and 1/5/10/20 real SQL queries for:

1. Singapore API + Singapore PostgreSQL on the Singapore EC2.
2. Hanoi API + Hanoi PostgreSQL on the Hanoi EC2.
3. Singapore API port 8081 + Hanoi PostgreSQL over private VPC addressing.

Migration and logical backup/restore use the two real PostgreSQL instances and remain separate presenter operations. They do not prove EBS Local Snapshot behavior. Set `enable_hanoi_local_frontend=true` only in a newly reviewed plan to add an optional Nginx UI on Hanoi port 8082.

The default frontend and API transport is HTTP and is for synthetic data only. CloudFront must remain disabled until the API has a reviewed TLS endpoint; otherwise an HTTPS frontend cannot call an HTTP API in modern browsers.

## 3. Minimal Hanoi smoke test

Only after explicit approval of the 22-create smoke plan:

```powershell
cd infrastructure\terraform\environments\smoke
$env:TF_VAR_expected_account_id = aws sts get-caller-identity --profile thangvn --query Account --output text
terraform show -no-color phase2b2-smoke.tfplan
terraform apply phase2b2-smoke.tfplan
cd ..\..\..\..
.\infrastructure\terraform\scripts\verify-smoke.ps1
```

The verifier independently checks:

- EC2 state, type, and exact `ap-southeast-1-han-1a` placement.
- encrypted gp3 volume placement in the same Local Zone.
- localhost-only container health through an allowlisted SSM command.
- the mounted data volume marker.

This proves placement, EBS attachment, SSM, artifact delivery, Docker, and real HTTP on the instance. It is not a public three-tier or ALB benchmark.

Record the verification output. Before continuing, either obtain separate approval to clean up the smoke environment using the teardown runbook or account for its extra 2 vCPUs and hourly cost. The known 16-vCPU quota can accommodate smoke and full together (8 EC2 vCPUs total), but running both wastes money.

## 4. Full managed deployment

Only after the smoke result and a fresh explicit approval of the full plan:

```powershell
cd infrastructure\terraform\environments\full
$env:TF_VAR_expected_account_id = aws sts get-caller-identity --profile thangvn --query Account --output text
terraform show -no-color phase2b2-full.tfplan
terraform apply phase2b2-full.tfplan
cd ..\..\..\..
.\infrastructure\terraform\scripts\verify-full.ps1
```

The full verifier performs live AWS inventory, requires no public EC2/database addresses, checks RDS encryption and status, calls each ALB `/health` and `/api/topology`, reads real orders, writes a uniquely named synthetic order, and runs 1/5/10/20 sequential SQL operations. It writes `evidence/aws-deployment-latest.json`, which is served by the existing localhost dashboard evidence mount. Do not display `AWS_REAL` readiness until this evidence says `SUCCEEDED`.

## 5. Real benchmark

Run only after full verification succeeds:

```powershell
.\scripts\benchmark\aws-real.ps1 -Profile CostMinimal -Scenario All -Samples 100 -Warmups 5 -Origin 'presenter-laptop-vietnam'
```

The benchmark reads the deployed Terraform endpoints unless explicit endpoints are supplied. It rejects endpoints that do not return `mode=AWS_REAL`, preserves warm-ups separately, records every raw HTTP/DB timing, and writes `evidence/aws-real-benchmark-latest.json`. Never merge this file with `LOCAL_NETWORK_EMULATION` evidence.

For the hybrid scenario, first generate and review a separate plan:

```powershell
cd infrastructure\terraform\environments\full
terraform plan -var sg_database_target=hanoi -out=phase2b2-hybrid.tfplan
terraform show -no-color phase2b2-hybrid.tfplan
```

Applying the hybrid plan is a separate operator decision because it replaces/rebootstraps the Singapore app instance. Verify `/api/topology` reports the Singapore app vantage and Hanoi database location before measuring.

## 6. Troubleshooting

- EC2 bootstrap logs: use SSM and inspect `/var/log/cloud-init-output.log`, `/var/log/hanoi-lab-bootstrap.log`, or `/var/log/hanoi-lab-postgres-bootstrap.log`.
- Container status: `sudo docker ps -a`; logs: `sudo docker logs backend`, `frontend`, or `hanoi-postgres`.
- ALB: inspect both target groups; backend health deliberately fails until its database is reachable.
- Secrets: inspect only metadata with `describe-secret`; never paste `get-secret-value` output into terminals, logs, or tickets.
- Capacity errors: do not silently change instance family/size. Stop, capture the AWS error, confirm current offerings/quota, then create a new cost/plan review.
- RDS can take several minutes. Do not treat target health as failed while Terraform is still creating dependencies.

## Explicit exclusions

No migration, EBS Local Snapshot, regional snapshot comparison, restore, TLS certificate, DNS record, production data, or HA upgrade is authorized by this runbook. Those require separate reviewed phases.
