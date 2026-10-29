# AWS bootstrap recovery — Phase 2B-5

## Confirmed failure and current boundary

Hanoi instance `i-07a5107d21ec5654e` is running and SSM Online in `ap-southeast-1-han-1a`. Its encrypted gp3 data volume `vol-0dbf75c6149f5f5f1` is attached and was mounted as ext4 at `/var/lib/hanoi-postgres` before bootstrap failed. The failure was an invalid artifact URL derived from Local Zone context:

```text
https://hanoi-lz-cost-minimal-artifacts-43a7585f4f1bfe44afd6d61c1c.s3.ap-southeast-1-han-1.amazonaws.com/minimal-images.tar
```

The bucket and object are in parent Region `ap-southeast-1`; the reviewed regional endpoint is `https://s3.ap-southeast-1.amazonaws.com`. Singapore instance `i-0cf960f74e80cde33` has healthy PostgreSQL and API on port 8080. Its hybrid phase failed only because the Hanoi secret has no version.

No live repair, schema initialization, secret update, container start, instance restart, snapshot, or Terraform apply was performed while preparing this procedure.

## Source-of-truth behavior

The shared bootstrap now distinguishes:

- parent Region: `ap-southeast-1`;
- Hanoi Availability Zone: `ap-southeast-1-han-1a`;
- Hanoi network border group: `ap-southeast-1-han-1`.

Artifact retrieval explicitly unsets generic and S3-specific endpoint overrides, supplies both `--region ap-southeast-1` and the regional S3 endpoint, retries five times with bounded backoff, and checks SHA-256 before loading images. Database recovery never formats an already mounted filesystem, never replaces an initialized database whose credential file is missing, never deletes an existing container, and never blindly reruns all cloud-init. The schema marker is stored on the persistent PostgreSQL volume.

## Reviewed SSM phases

The local-only operator wrapper is [invoke-cost-minimal-repair.ps1](../infrastructure/terraform/scripts/repair/invoke-cost-minimal-repair.ps1). It is not exposed to the presenter browser. Without `-Execute`, it only performs AWS read operations and prints a preview.

| Phase | Exact target | Intended mutation | Key guard |
| --- | --- | --- | --- |
| `HanoiRuntime` | `i-07a5107d21ec5654e` | Download/verify images, create missing PostgreSQL credentials, start missing PostgreSQL/backend, publish the first secret version, initialize synthetic schema | Requires explicit `-AllowSchemaInitialization`; verifies exact mounted EBS; no format/remove/restart |
| `HanoiVerify` | `i-07a5107d21ec5654e` | None on host; creates an SSM command record | Verifies mount, file mode, `pg_isready`, health and topology without reading secret values |
| `SingaporeHybrid` | `i-0cf960f74e80cde33` | Create hybrid env file and start only `hybrid-backend` | Requires Case 1 health first and after; never restarts `postgres` or `backend` |

Preview commands:

```powershell
.\infrastructure\terraform\scripts\repair\invoke-cost-minimal-repair.ps1 -Phase HanoiRuntime -Profile thangvn
.\infrastructure\terraform\scripts\repair\invoke-cost-minimal-repair.ps1 -Phase HanoiVerify -Profile thangvn
.\infrastructure\terraform\scripts\repair\invoke-cost-minimal-repair.ps1 -Phase SingaporeHybrid -Profile thangvn
```

Future commands requiring separate approval:

```powershell
.\infrastructure\terraform\scripts\repair\invoke-cost-minimal-repair.ps1 -Phase HanoiRuntime -Profile thangvn -Execute -AllowSchemaInitialization
.\infrastructure\terraform\scripts\repair\invoke-cost-minimal-repair.ps1 -Phase HanoiVerify -Profile thangvn -Execute
.\infrastructure\terraform\scripts\repair\invoke-cost-minimal-repair.ps1 -Phase SingaporeHybrid -Profile thangvn -Execute
```

The first command includes a migration/schema initialization and must not be approved implicitly as “just bootstrap.” Each execution rechecks the AWS account, exact target tags, state, and SSM status and records a sanitized result under `evidence/aws-repair/`. Database credentials are fetched or generated only on the target and are never included in SSM parameters, stdout, stderr, or evidence.

## Expected effects, failure handling, and rollback

Hanoi runtime success produces healthy `postgres` and `backend` containers, a first Hanoi secret version, and a persistent schema marker. Singapore hybrid success adds only `hybrid-backend`; the existing port-8080 Case 1 service remains untouched. A partially failed phase deliberately leaves created resources in place for diagnosis and reports the Command ID; it does not delete containers, reset credentials, overwrite data, restart instances, or attempt automatic rollback.

Rollback is therefore separately approved and evidence-driven. For Hanoi, preserve the data volume and inspect the recorded stage, container state, and sanitized logs before any stop/remove action. For Singapore, an unhealthy newly created hybrid container may be stopped or removed only after separate approval; Case 1 containers must not be changed. Do not remove Terraform resources from state to conceal a retained object.

## Terraform reconciliation

The review-only plan `phase2b5-bootstrap-reconciliation.tfplan` has SHA-256 `0ccb9eaf286e86857d966fefc8c5ae81919a12589553ed40d43bf4c45ad0b830` and proposes `4 add, 4 change, 4 destroy`. User-data changes force replacement of both instances and both attachments; both EIPs are reassociated; each runtime IAM policy gains `DescribeSecret` for its own secret metadata. Neither protected data volume is deleted. Applying this plan would interrupt healthy Case 1 and is not authorized.

Terraform does not rerun cloud-init merely because source changed. Until a separately reviewed future replacement, the live instances are reconciled operationally by the hashed SSM scripts while Terraform continues to show the intentional user-data replacement diff.

## Post-approval verification

After the three SSM phases succeed, independently verify EC2/EBS placement, Case 1 health and existing rows, Hanoi synthetic CRUD, hybrid topology identity, private TCP 5432 connectivity, and 1/5/10/20-query workloads. Run five warm-ups and 100 measured samples per workload for Hanoi and Hybrid, exporting raw client, application, and SQL timing fields. Only successful live evidence may set the presenter dashboard to AWS_REAL ready; local emulation remains separate.
