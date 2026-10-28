# Phase 2B-1 Terraform review

Status date: 2026-10-28. **No AWS resources were created, modified, or destroyed.** Saved plans are local and excluded from Git.

## Readiness result

AWS profile `thangvn` authenticated successfully. `ap-southeast-1-han-1a` is visible, opted in, and reports 33 C7i/M7i/R7i offerings. The plans select `c7i.large` and `m7i.large`, both returned by the live offering API. Offerings prove API inventory, not physical capacity at apply time.

The Standard On-Demand EC2 quota is 16 vCPUs:

- Smoke alone: 2 vCPUs.
- Full lab: 6 EC2 vCPUs (`t3.small`, `c7i.large`, `m7i.large`). RDS capacity does not consume the EC2 quota.
- Smoke and full running simultaneously: 8 vCPUs.

Observed quotas also include 50 ALBs, 40 RDS DB instances, 5 VPCs, 5 internet gateways, and 200 subnets/VPC. IAM policy simulation returned `allowed` for the representative VPC, subnet, EC2, EBS, VPC endpoint, IAM role/pass-role, ALB, RDS, S3, and Secrets Manager create actions. Simulation does not prove capacity, SCP outcomes with missing runtime context, or successful service-linked-role creation.

## Architecture under review

```text
Internet
  |-- Singapore ALB (two regional AZ subnets, HTTP/80)
  |      `-- private SG EC2: frontend :8081 + API :8080
  |             |-- private Single-AZ RDS PostgreSQL 16 (default)
  |             `-- private Hanoi PostgreSQL :5432 (reviewed hybrid switch)
  |
  `-- Hanoi ALB (one Local Zone subnet, HTTP/80)
         `-- private Hanoi EC2: frontend :8081 + API :8080
                `-- private Hanoi EC2 PostgreSQL 16 + encrypted gp3

Private instances --> S3 gateway endpoint --> encrypted image archive
Private instances --> interface endpoints --> SSM + Secrets Manager
```

AWS documents that regional ALBs require two distinct Availability Zone subnets, while an ALB in Local Zones may use one or more Local Zone subnets. The plan follows that distinction and never mixes regional and Local Zone subnets on one ALB. See [ALB subnet requirements](https://docs.aws.amazon.com/elasticloadbalancing/latest/APIReference/API_SetSubnets.html) and [ALB Local Zone limitations](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html).

The ECS-optimized Amazon Linux 2023 AMI is resolved from the AWS public SSM parameter at plan/apply time. It supplies Docker and SSM Agent; application and PostgreSQL 16 images are built locally, saved as immutable plan-hashed archives, uploaded to private encrypted S3, and loaded on the instances. No ECS service or Fargate dependency is assumed in Hanoi.

## Terraform results

Commands completed independently in both roots:

```powershell
terraform fmt -check -recursive infrastructure/terraform
terraform init -input=false
terraform validate -no-color
terraform plan -input=false -lock=false -no-color -out=<local-plan>
terraform show -json <local-plan>
```

| Environment | Add | Change | Destroy | Result |
| --- | ---: | ---: | ---: | --- |
| Smoke | 22 | 0 | 0 | Plan saved |
| Full | 87 | 0 | 0 | Plan saved |

Machine-readable counts are in [terraform-plan-inventory.json](terraform-plan-inventory.json). The principal planned resources are:

- Smoke: VPC, internet gateway, one Hanoi subnet, S3 gateway endpoint, one `c7i.large`, encrypted 12 GiB root and 10 GiB protected gp3 data volume, SSM role/profile, zero ingress rules, private encrypted artifact bucket.
- Full: one VPC, eight subnets, two ALBs, three private EC2 instances, one private RDS instance, one protected 30 GiB Hanoi data volume, seven security groups, four interface endpoints plus an S3 gateway endpoint, two instance roles/profiles, one private artifact bucket, and one explicit Hanoi database secret. RDS creates its managed master secret as part of the DB service configuration.

## Security review

- All EC2 root and data volumes and RDS storage are encrypted.
- IMDSv2 is required with hop limit 1.
- Full-lab EC2 instances have no public IP addresses. RDS is `publicly_accessible=false`.
- Port 5432 is not public. RDS accepts it only from the Singapore app security group. Hanoi PostgreSQL accepts it only from the Hanoi app and the pre-authorized Singapore app group for the hybrid case.
- The only `0.0.0.0/0` full-lab ingress is TCP/80 on the two ALBs. TLS/DNS ownership is not supplied, so this lab plan intentionally uses HTTP and must not carry sensitive data.
- Smoke has a temporary public IPv4 for outbound SSM but no inbound rule and no SSH key.
- Artifact buckets block public access, deny insecure transport, enable versioning and AES-256 server-side encryption, and permit object reads only to planned instance roles.
- Database passwords are absent from Git, Terraform variables, outputs, and user data. RDS manages its master secret; Hanoi generates a random password on the DB host and writes it to a pre-created Secrets Manager secret over a private endpoint.
- RDS and the Hanoi data EBS volume use deletion safeguards. ALBs enable deletion protection.
- IAM roles are scoped to SSM core permissions, one artifact object, and only the necessary secret ARNs. No access keys are created.

## Bootstrap verification

The packaged frontend, backend, and PostgreSQL 16 images were run together locally from the deployment tags. The frontend returned HTTP 200, proxied `/health`, returned `AWS_REAL` topology when explicitly configured, and completed 20 sequential real PostgreSQL queries. This validates the image bundle and container DNS contract; it does **not** validate EC2 cloud-init, Local Zone capacity, ALB activation, RDS creation, or real AWS latency.

## Known limitations and deployment gates

- Neither saved plan has been applied. Runtime resource IDs, endpoints, health, placement, CRUD, latency, and cost are therefore `NOT_DEPLOYED`/`NOT_MEASURED`.
- EC2 offerings are not a capacity reservation. `InsufficientInstanceCapacity` remains possible.
- Terraform planning cannot guarantee every create permission, service-linked role, or organization policy outcome.
- Hanoi uses one Local Zone and self-managed PostgreSQL; Singapore RDS is Single-AZ. Neither is a production HA design.
- The Singapore RDS versus Hanoi self-managed database comparison is operationally useful but not a geography-only benchmark.
- Interface endpoints are intentionally placed in one Singapore AZ to limit hourly cost; management-plane access loses redundancy if that AZ is unavailable.
- HTTP ALBs are acceptable only for synthetic demo data. Production use requires operator-owned DNS and ACM certificates.
- The full image archive is about 222 MB. Upload/bootstrap time varies with the operator connection and S3 path.
- Snapshot creation, local snapshot-chain behavior, restore, and billing are Phase 5 operations and are not planned or claimed here.

The configurations are ready for operator review. Deployment is not authorized by this document.

