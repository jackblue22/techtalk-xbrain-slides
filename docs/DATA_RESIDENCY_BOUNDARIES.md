# Data Residency Boundaries

- An API call made through `ap-southeast-1` does not prove data is physically in Hanoi. Evidence must include exact Availability Zone, EBS volume AZ, and snapshot `Location`.
- EBS snapshots from Local Zone volumes default to the parent Region unless local is selected.
- Hanoi S3 uses a directory bucket in one Local Zone and lacks replication/versioning; it is not interchangeable with regional S3 Standard.
- CloudFront is a global edge service and is outside the Hanoi Local Zone boundary.
- Logs, metrics, AMIs, KMS behavior, package registries, control-plane metadata, and operator workstations need separate review; compute placement alone is not a complete residency statement.
- Only synthetic lab records are allowed. Do not import customer or production data.

