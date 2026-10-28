# Cost and Cleanup Gate

Phase 0–1 creates no AWS resources. Local Docker usage has no AWS charge.

Before Phase 2, capture current dated prices for the exact offered instance types, EBS gp3 capacity/IOPS, ALBs, public IPv4, NAT/data processing, data transfer, logs, and snapshots. Set a named budget owner, maximum runtime window, tag policy, and cleanup operator. Do not publish an amount until it is sourced from the current AWS pricing page or calculator.

The Phase 2 teardown must inventory resources by `Project=hanoi-lz-live-demo`, run a reviewed `terraform destroy` plan, preserve approved evidence only, and verify that EC2 instances, ALBs, EBS volumes/snapshots, elastic IPs, NAT gateways, and S3 objects are absent. Local Zone opt-in is an account setting and needs a separate operator decision.

