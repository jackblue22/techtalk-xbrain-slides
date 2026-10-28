# AWS Availability and Runtime Verification

Reviewed against official AWS material on 2026-10-28. Documentation support is not proof that a particular account is opted in or that a particular instance type has current capacity. The Phase 2 runtime preflight must capture both.

## Documentation checklist

| Capability | Hanoi finding | Design consequence |
| --- | --- | --- |
| Zone identity | `ap-southeast-1-han-1a`, ID `apse1-han-az1`, group `ap-southeast-1-han-1`, parent `ap-southeast-1` | Verify exact AZ/ID at runtime |
| EC2 | C7i, M7i, R7i documented | Discover offerings; do not assume T3 |
| ECS | Supported; Fargate workloads are not supported in Local Zones | Docker baseline, then ECS EC2 only |
| ALB | Supported; at least one Local Zone subnet is valid | Separate Hanoi ALB from regional ALB |
| EBS | gp3 and Local Snapshots supported | Self-managed PostgreSQL data volume |
| Local snapshots | Explicit `--location local`; default is regional | Display returned `Location`; never infer it |
| Snapshot chains | Successive snapshots cannot switch local/regional destination | Use two disposable source volumes |
| S3 | Local Zone requires a directory bucket; Hanoi lists One Zone-IA | Never model it as regional S3 Standard |
| Directory-bucket gaps | No versioning, replication, or `aws s3 sync` | Use `s3 cp --recursive` if later enabled |
| RDS / ElastiCache | Blank in Hanoi service matrix | PostgreSQL on EC2; no local ElastiCache |
| CloudFront | Worldwide edge network / global IP scope | Keep outside Hanoi boundary |

## Official sources

- [Hanoi Local Zone general availability](https://aws.amazon.com/about-aws/whats-new/2026/06/aws-local-zones-hanoi-vietnam/)
- [Available Local Zones](https://docs.aws.amazon.com/local-zones/latest/ug/available-local-zones.html)
- [AWS Local Zones features matrix](https://aws.amazon.com/about-aws/global-infrastructure/localzones/features/)
- [ECS in Local Zones](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/cluster-regions-zones.html)
- [Application Load Balancer subnets](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html)
- [Local snapshots in Local Zones](https://docs.aws.amazon.com/ebs/latest/userguide/snapshots-localzones.html)
- [EC2 create-snapshot CLI](https://docs.aws.amazon.com/cli/latest/reference/ec2/create-snapshot.html)
- [Create an S3 directory bucket in a Local Zone](https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-directory-bucket-LZ.html)
- [Directory-bucket differences](https://docs.aws.amazon.com/AmazonS3/latest/userguide/s3-express-differences.html)
- [CloudFront edge locations](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/LocationsOfEdgeServers.html)

## Read-only runtime preflight

The localhost agent exposes the first three commands as predefined actions. Run them only under the intended profile.

```powershell
aws sts get-caller-identity --profile <profile>
aws ec2 describe-availability-zones --region ap-southeast-1 --all-availability-zones --filters Name=zone-type,Values=local-zone Name=zone-name,Values=ap-southeast-1-han-1a --profile <profile>
aws ec2 describe-instance-type-offerings --region ap-southeast-1 --location-type availability-zone --filters Name=location,Values=ap-southeast-1-han-1a --profile <profile>
```

Record account ID, principal ARN, zone fields, opt-in status, raw timestamps, and offered types in `evidence/`. Do not opt in from an automated preflight.

## Phase 2 permission and cost gate

Required capability groups will include read-only STS/EC2 inventory, then scoped VPC, EC2, EBS, ELBv2, IAM instance-profile/pass-role, SSM, CloudWatch Logs, and tagging permissions. Snapshot and cleanup permissions are deferred until their phase. Do not grant broad administrator credentials to the app or agent.

Cost-bearing candidates include EC2 runtime, EBS volumes/snapshots, ALB hours/LCUs, public IPv4, NAT gateways/data processing if selected, inter-zone/region data transfer, CloudWatch ingestion, and optional S3. Obtain current prices from the AWS Pricing pages/calculator on the day of the plan; this repository intentionally contains no invented estimate.

