# Content Verification

Checked: 2026-10-26. This file is an engineering evidence register, not legal advice.

| Claim / content | Status | Primary source | Notes |
|---|---|---|---|
| Hanoi Local Zone is generally available | VERIFIED | https://aws.amazon.com/about-aws/whats-new/2026/06/aws-local-zones-hanoi-vietnam/ | AWS announcement dated 2026-06-19. |
| Zone name `ap-southeast-1-han-1a`, group `ap-southeast-1-han-1`, parent Region `ap-southeast-1` | VERIFIED | https://docs.aws.amazon.com/local-zones/latest/ug/available-local-zones.html | AWS Local Zones user guide. |
| Opt-in uses `ModifyAvailabilityZoneGroup` / `modify-availability-zone-group` | VERIFIED | https://docs.aws.amazon.com/local-zones/latest/ug/getting-started.html | Deck command substitutes the verified Hanoi group/Region values. Run with the presenter account before the talk. |
| Hanoi supports EC2 C7i/M7i/R7i, EBS, ALB, ECS, EKS, VPC, Direct Connect, S3 One Zone-IA, and Application Migration Service | VERIFIED | https://aws.amazon.com/about-aws/global-infrastructure/localzones/features/ | Service matrix is location-specific and should be rechecked before presenting. |
| Amazon RDS is not listed as locally available in Hanoi | VERIFIED | https://aws.amazon.com/about-aws/global-infrastructure/localzones/features/ | Regional access remains possible; do not generalize this to every Local Zone. |
| Local Zones extend a parent Region and can access regional services through AWS networking | VERIFIED | https://aws.amazon.com/about-aws/global-infrastructure/localzones/faqs/ | Does not imply that regional data automatically resides locally. |
| Local-Zone S3 uses directory buckets; supported storage class in Local Zones is S3 One Zone-IA | VERIFIED | https://docs.aws.amazon.com/AmazonS3/latest/userguide/directory-bucket-data-residency.html | Feature behavior differs from general-purpose regional buckets. |
| Hanoi supports EBS Local Snapshots; default snapshot destination can be the parent Region unless local destination is selected/enforced | VERIFIED | https://docs.aws.amazon.com/ebs/latest/userguide/snapshots-localzones.html | IAM controls are part of the residency design. |
| One published Hanoi Local Zone is one local fault domain; two instances there are not multi-AZ | VERIFIED | https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions-availability-zones.html | The AWS availability guidance recommends multiple AZs for AZ-failure tolerance. |
| Vietnam Personal Data Protection Law 91/2025/QH15 is effective 2026-01-01 | VERIFIED | https://chinhphu.vn/?docid=214590&pageid=27160 | Official Government portal. |
| Decree 356/2025/NĐ-CP implements the PDPL and is effective 2026-01-01 | VERIFIED | https://chinhphu.vn/?docid=216387&pageid=27160 | Official Government portal. |
| Decree 53/2022/NĐ-CP remains a relevant cybersecurity instrument | VERIFY | https://vanban.chinhphu.vn/?classid=1&docid=206381&pageid=27160&typegroupid=3 | Applicability is organization/workload-specific; obtain counsel review. |
| A workload must store all Vietnamese personal data in Vietnam | ASSUMPTION — DO NOT PRESENT | — | The deck explicitly rejects this blanket statement. Classification, scope, transfer, safeguards, and evidence require legal review. |
| Measured latency/error-rate improvement | BENCHMARK_PENDING | Presenter lab | No values are rendered. Record conditions, sample size, and timestamp before replacing placeholders. |
| Pricing/TCO comparison | VERIFY | https://aws.amazon.com/about-aws/global-infrastructure/localzones/pricing/ | No amounts are rendered; data transfer and service pricing require scenario-specific calculation. |
| AWS Activate exists for eligible startups | VERIFIED | https://aws.amazon.com/startups/credits | Deck links only to the official program; it makes no credit or eligibility promise. |

## Before presenting

1. Recheck the Hanoi row in the AWS Local Zones feature matrix.
2. Run the CLI discovery/placement commands in the actual presenter account.
3. Replace `BENCHMARK_PENDING` only with exported lab results.
4. Ask qualified Vietnamese counsel to review slide 6 and its presenter notes.
5. Confirm the source/license of `hanoi.png` and permission to use company marks.

