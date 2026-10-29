# Active AWS resource and cost report — Phase 2B-5

Observed 2026-10-29 with profile `thangvn` in `ap-southeast-1`. This is a read-only report; no resource was changed.

| Resource class | Current project inventory | Current state | Fixed-cost treatment |
| --- | --- | --- | --- |
| EC2 | Hanoi `i-07a5107d21ec5654e`; Singapore `i-0cf960f74e80cde33` | both running, SSM Online | Hanoi `$0.1029/h`; Singapore `$0.0264/h` |
| Elastic IP | `eipalloc-0d333bcd1cf2d8f97`; `eipalloc-07c6eb8c26f377e7c` | associated | `$0.0100/h` total; still billed if instances stop |
| Root EBS | `vol-0eec983fd33107897`; `vol-0ba3eec6c19beda64` | encrypted gp3, 30 GiB each, attached | included in 80-GiB storage estimate |
| PostgreSQL EBS | `vol-0dbf75c6149f5f5f1`; `vol-09ace6c1f9963a5fb` | encrypted gp3, 10 GiB each, attached, `prevent_destroy` | retained and billable until explicit deletion |
| S3 | artifact and public static-website buckets | present; artifact object verified | about `$0.000009/h` plus requests/transfer |
| Secrets Manager | Hanoi and Singapore database secrets | active; Hanoi has 0 versions, Singapore has 1 | about `$0.001096/h` total |
| Project EBS snapshots | none | none found | `$0` |

Estimated current fixed cost is **$0.15303/hour**, **$1.22/8 hours**, or **$3.67/24 hours**, excluding transfer and request-variable charges. Stopping compute alone would still leave approximately **$0.02373/hour-equivalent** for EIPs, EBS, S3, and active secrets. Script preparation and Terraform planning do not alter this inventory or cost.

The Terraform state contains the applied 48-resource project. The Phase 2B-5 reconciliation plan is not a repair plan: it would replace both instances and attachments. Keep the current infrastructure running until the separately approved SSM recovery or separately approved cost-control stop procedure. Any cleanup must use the teardown runbook and report every residual resource and charge.
