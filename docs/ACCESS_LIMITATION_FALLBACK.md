# Access Limitation Fallback

Status date: 2026-10-28.

No separate file containing newer “Access Limitation Fallback” requirements was found in this repository or the adjacent project directory. This implementation therefore treats the user's 2026-10-28 requirements as the controlling addendum to the master prompt.

## Deployment mode contract

| Mode | Evidence source | Current status | Admission rule |
| --- | --- | --- | --- |
| `AWS_REAL` | AWS API identity, runtime inventory, and measurements from deployed resources | Terraform ready; SSO authenticated; Hanoi is `opted-in`; 33 offerings visible; no deployment yet | Requires budget approval, review of the saved smoke/full plans, and explicit deployment approval |
| `EXTERNAL_VN_REAL` | Real workload hosted by an approved provider in Vietnam plus provider-native identity/location evidence | Design only | Must name the provider and facility/region, record endpoint/vantage metadata, and never label results as AWS or Local Zone measurements |
| `LOCAL_NETWORK_EMULATION` | Real local HTTP and PostgreSQL operations with operator-configured Toxiproxy delay | Implemented and preferred while access is unresolved | Every record/UI view must say `LOCAL_NETWORK_EMULATION`, include provenance, and disclaim AWS performance |

The workload contract is portable across modes: `/health`, `/api/topology`, order CRUD, sequential database benchmark, and benchmark write endpoints. Mode-specific identity and provenance are runtime configuration, not inferred from latency.

## Read-only AWS diagnostic

The default configured profile was queried without changing credentials or account settings:

```powershell
aws sts get-caller-identity --profile default
aws ec2 describe-availability-zones --region ap-southeast-1 --all-availability-zones --profile default
aws ec2 describe-instance-type-offerings --region ap-southeast-1 --location-type availability-zone --filters Name=location,Values=ap-southeast-1-han-1a --profile default
```

The stale default and other static profiles failed authentication. The existing `thangvn` SSO profile passes STS. A fresh read-only check on 2026-10-28 shows `ap-southeast-1-han-1a` is visible as a Local Zone with `OptInStatus=opted-in` and 33 C7i/M7i/R7i offerings. Phase 2B-1 created local Terraform plans only; it did not change account settings or create resources.

## Local workflow

`docker-compose.emulation.yml` adds three independent PostgreSQL targets, three API profiles, and a pinned Toxiproxy container. Its management API remains internal to the Compose network; only the three demo listeners bind to host loopback. Delays are configurable in `.env.emulation` and are deliberately described as illustrative.

Cases 1–3 issue actual sequential HTTP/SQL work and save raw evidence. Case 4 performs a real logical dump, isolated restore, row-count/checksum comparison, and target-only post-cutover write. Case 5 performs a real logical backup and isolated recovery restore.

## Limitations

- Synthetic delay does not reproduce real routing, congestion, packet loss, bandwidth, TLS/DNS, AWS control-plane behavior, noisy neighbors, availability, or service limits.
- Results are neither measurements nor predictions of AWS Singapore or Hanoi Local Zone performance.
- Local container labels do not prove geography, residency, or provider identity.
- The migration drill does not measure AWS data-transfer duration, production downtime, RPO, or RTO.
- The recovery drill is PostgreSQL logical backup/restore. It does not emulate EBS Local Snapshots, snapshot `Location`, snapshot chains, durability, or failure-domain independence.
- `EXTERNAL_VN_REAL` is an interface/design path only; no external resource is provisioned.

## AWS_REAL continuation gate

The `infrastructure/terraform` tree now contains separate functional `smoke` and `full` roots with successful saved plans. `terraform apply` remains an explicit operator-approved action outside this fallback. Until live verification succeeds, the dashboard must report AWS resources as `NOT_DEPLOYED` and keep local-emulation evidence separate.
