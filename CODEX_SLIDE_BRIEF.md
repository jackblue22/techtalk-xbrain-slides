# Codex Build Brief — AWS Hanoi Local Zone Tech Talk

## Mission
Build a production-quality, browser-based, 16:9 HTML/CSS/JS technical conference slide deck for a 25-minute talk titled **AWS Hanoi Local Zone for Vietnam Workloads: Architecture, Data Residency & Trade-offs**. Audience: Cloud Engineers, DevOps Engineers, Solutions Architects. Slide language: English; presenter notes can be Vietnamese/English mixed. 14 slides plus appendix. Never invent AWS capabilities, legal requirements, pricing, or benchmark results.

## Mandatory first steps
1. Inspect repository and find `getdesignmd`, `getdesign.md`, design tokens, installed design skills, or equivalent. Read and compare available design systems before selecting one. If unavailable, explicitly log that and use the fallback design specification below; do not pretend it exists.
2. Inspect existing project conventions, dependencies, and asset directories. Preserve any useful existing setup.
3. Create a short `DESIGN_DECISIONS.md` with selected style, typography, layout, interaction, asset decisions and rejected alternatives.
4. Create `CONTENT_VERIFICATION.md` with source URLs, date checked, and status (VERIFIED/VERIFY/ASSUMPTION) for each technical/legal claim.

## Visual design (tham khảo thôi vì hơi cũ được thì theo như các lệnh trước để phù hợp với uiux của techtalk!)
- Design canvas: 1920x1080, 16:9, fluid uniform scaling, no cropped content on 1366x768 and 1920x1080 projectors.
- Safe margin: 110px; title 58–68px, body 28–34px, diagram labels >=24px, source footnotes >=18px.
- Theme: sophisticated dark technical keynote, #0B1220 background, #162338 surface, #F3F6FC foreground, #F59E0B accent, #38BDF8 data flows. Avoid excessive glassmorphism, generic gradients, ornamental icons and card overload.
- Favor custom SVG topology, data-flow arrows, terminal snippets and comparative diagrams over stock imagery. Keep each slide to one main idea. Avoid small dense tables.
- Use official AWS Architecture Icons under their usage guidelines. Cite image/asset sources and maintain asset license notes. No fake AWS Console screenshots or invented AWS facility photos.
- Slides 1 and 14 may be dramatic typographic layouts; 5, 9, 12 should be architecture-led; 10 benchmark-led; 6 and 13 editorial comparison layouts.

## Implementation (tương tự chỉ tham khảo thôi có thể làm khác cũng được)
- Build working HTML/CSS/JS slides using existing repo stack where appropriate, otherwise vanilla Vite or lightweight framework. No need for PowerPoint output.
- Arrow keys/space navigation, Home/End, slide counter, fullscreen shortcut, speaker notes mode, overview mode, print-friendly layout, and URL hash deep linking.
- Speaker notes stored separately from projected slide body, with per-slide timing and transitions.
- Make source/content/metrics editable from structured JS/JSON data; separate visual components from content.
- Add an asset manifest: source URL, license/permission, local filename, placement, alt text, status.
- Add verification/placeholder status for missing assets and unverified claims. No fictitious measured numbers.

## Slide content and design instructions (flexible, tham khảo vui thôi, có thể nhiều hơn nếu cần thiết và cần enrich in img + ref<evidence> thay vì quá nhiều text dày đặc !)
1. **Title (0:30)** — AWS Hanoi Local Zone for Vietnam Workloads / Architecture, Data Residency & Trade-offs. Full-bleed licensed Hanoi night skyline, dark overlay, left aligned title 60% width. Do not imply photo is an AWS data center.
2. **Vietnam Workload Dilemma (1:30)** — Singapore-hosted SaaS (ALB/app/RDS/S3), users in Vietnam, latency and residency requirements. 30% text / 70% SVG architecture. Speaker hook: what would you move first?
3. **Local Zone Is Not a Region (1:30)** — Hanoi is an extension of Singapore parent Region. Show regional control-plane/dependencies, Hanoi local resources, single published local zone. Two clearly bounded regions and labeled arrows.
4. **Opt In. Deploy. Verify. (1:30)** — 4-stage flow: opt-in group `ap-southeast-1-han-1`, Local Zone subnet, supported EC2, verify placement `ap-southeast-1-han-1a`. Real validated AWS CLI snippet, no live provisioning in talk. Reserve a 16:9 screenshot/terminal slot.
5. **Where Does Data Actually Live? (2:00)** — EC2 Hanoi vs DB Singapore, logs, backups/snapshots, AI/external APIs. Color code local vs cross-border flows. Distinguish at-rest/in-transit/in-processing and control plane vs data plane.
6. **Residency Is Not Compliance (2:00)** — Vietnam legal landscape and data classification, obligation -> data flow -> safeguards -> evidence. Verify current legal instruments, status and scope before presenting; avoid blanket claims that all Vietnam personal data must be stored locally. Legal review disclaimer in notes. Cite official primary sources.
7. **Service Reality Check (1:30)** — 2x3 matrix: Compute, Storage, Containers, Networking, Database, Serverless/AI. Show confirmed Hanoi availability and gaps; distinguish local deployment from regional access. Verify instance families/sizes/quotas before publishing.
8. **Three Architectural Gotchas (1:30)** — S3 directory buckets/One Zone-IA and feature gaps; RDS absent locally -> self-managed DB or external Vietnam data provider; private connectivity, VPN, DX, VPC endpoint nuances. No inaccurate blanket 'no endpoints'.
9. **Moving Compute Doesn't Move Dependencies (2:00)** — SG app/SG DB vs HN app/SG DB vs HN app/HN DB. Highlight cross-location DB round trips and operations burden. Three equal diagrams.
10. **Let's Measure It (3:00)** — Live-ready benchmark comparison: /health, /products, /checkout-sim; client from Vietnam; show real p50/p95, error rate, conditions and sample size. Left terminal 45%, right chart 55%. If unavailable use `BENCHMARK_PENDING` and do not render invented results. Include prerecorded fallback.
11. **Migration Is More Than Lift-and-Shift (2:00)** — Discover -> Assess -> Build -> Replicate -> Cutover -> Validate. Separate stateless vs stateful, rollback, replication consistency, DNS, IaC and MGN eligibility.
12. **One Local Zone. One Local Fault Domain. (2:00)** — two instances in same Local Zone != multi-AZ. Local backups vs off-site DR; RPO/RTO, regional dependencies, failover. Large fault-domain boundary diagram.
13. **Is Hanoi the Right Choice? (3:00)** — comparison: full Singapore, Hanoi app+SG DB, full Hanoi self-managed, Hanoi app+VN data provider. Dimensions latency, residency, resilience, service availability, ops burden, data transfer/TCO. Use qualitative conditional assessments with stated assumptions. Mention AI inference limits briefly in speaker notes.
14. **Closer Isn't Automatically Better (1:00)** — 3 takeaways: Local Zone != Region; Residency != Compliance; Lower latency != successful architecture. Small AWS Activate mention with verified official URL, no invented eligibility/credit claims.

Total: 25 minutes.

## Appendix (non-timed)
- Official AWS service/instance availability matrix with check date.
- S3 directory bucket feature limitations, EBS snapshot residency options.
- Network decision matrix: Direct Connect, Site-to-Site VPN, VPC endpoints, Transit Gateway hairpin, data-transfer billing categories.
- Legal primary sources with document identifiers, effective dates and applicability caveats.
- EC2 self-managed PostgreSQL operations/HA/DR alternatives.
- Migration checklist, sample commands, lab setup and teardown.
- Q&A: regional failure, multi-AZ, compliance, RDS replacement, EKS, AI/GPU, cost, data transfer, private connectivity.

## Asset priorities
1. Official AWS Architecture Icons: https://aws.amazon.com/architecture/icons/
2. Official AWS Local Zones features: https://aws.amazon.com/about-aws/global-infrastructure/localzones/features/
3. AWS Local Zones user guide: https://docs.aws.amazon.com/local-zones/latest/ug/what-is-aws-local-zones.html
4. Official legal text: Vietnamese government legal portal and official gazette; verify exact URLs and current status.
5. Licensed Hanoi skyline for title. If unavailable, use a tasteful vector outline of Hanoi with labeled city; never substitute an unrelated skyline.
6. Authentic screenshots and benchmark results from user-provided lab; otherwise mark ASSET_NEEDED/BENCHMARK_PENDING.

## Quality gates
- Each slide has one thesis, readable at projector distance, no overlap, no overflow, accurate labels, and source in notes/footer.
- Run dev server, test keyboard navigation, fullscreen, speaker mode, print, 1366x768 and 1920x1080 viewport screenshots.
- Review all 14 screenshots and correct visual inconsistencies.
- No invented AWS service support, legal conclusions, cost figures, test results or asset licenses.
- Deliver README with run/build instructions, editable content locations, assets missing, claims needing verification, and demo prerequisites.


---

file này tác dụng tham khảo.

---

