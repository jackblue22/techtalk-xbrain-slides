import type { SlideDefinition } from "../types/deck";
import {
  Slide01Title, Slide02Dilemma, Slide03NotARegion, Slide04OptIn,
  Slide05DataLives, Slide06Compliance, Slide07RealityCheck,
  Slide08Gotchas, Slide09Dependencies, Slide10Measure,
  Slide11Migration, Slide12FaultDomain, Slide13RightChoice,
  Slide14Takeaways,
} from "../slides/TalkSlides";

const awsLaunch = "https://aws.amazon.com/about-aws/whats-new/2026/06/aws-local-zones-hanoi-vietnam/";
const awsLocations = "https://docs.aws.amazon.com/local-zones/latest/ug/available-local-zones.html";
const awsFeatures = "https://aws.amazon.com/about-aws/global-infrastructure/localzones/features/";
const awsGettingStarted = "https://docs.aws.amazon.com/local-zones/latest/ug/getting-started.html";
const awsFaq = "https://aws.amazon.com/about-aws/global-infrastructure/localzones/faqs/";
const s3Residency = "https://docs.aws.amazon.com/AmazonS3/latest/userguide/directory-bucket-data-residency.html";
const ebsSnapshots = "https://docs.aws.amazon.com/ebs/latest/userguide/snapshots-localzones.html";
const awsAzGuide = "https://docs.aws.amazon.com/global-infrastructure/latest/regions/aws-regions-availability-zones.html";
const pdpl = "https://chinhphu.vn/?docid=214590&pageid=27160";
const decree356 = "https://chinhphu.vn/?docid=216387&pageid=27160";
const decree53 = "https://vanban.chinhphu.vn/?classid=1&docid=206381&pageid=27160&typegroupid=3";
const activate = "https://aws.amazon.com/startups/credits";

export const slides: SlideDefinition[] = [
  {
    id: "title", title: "AWS Hanoi Local Zone for Vietnam Workloads", section: "Opening", duration: "0:30",
    transition: "Set the context: this is an architecture decision talk, not a product launch pitch.",
    notes: [
      "Chào mọi người. Hôm nay mình không hỏi ‘Local Zone có nhanh không?’—mình hỏi ‘nó thay đổi boundary và failure model như thế nào?’",
      "Clarify that the Hanoi skyline is city context, not an AWS facility.",
      "Promise three outcomes: a correct mental model, a traceable data-residency model, and a workload-fit decision framework.",
    ],
    sources: [{ label: "AWS Hanoi Local Zone GA", url: awsLaunch, status: "VERIFIED" }], component: Slide01Title,
  },
  {
    id: "vietnam-workload-dilemma", title: "Vietnam Workload Dilemma", section: "The decision", duration: "1:30",
    transition: "Ask the audience before revealing any recommendation: what would you move first?",
    notes: [
      "Scenario only: users are in Vietnam; ALB, app, RDS and S3 are currently in Singapore.",
      "Do not assert a latency number. Ask which synchronous dependency dominates the user journey.",
      "Residency is introduced as a requirement to classify—not proof that every byte must be local.",
    ],
    sources: [{ label: "Architecture scenario", url: "CONTENT_VERIFICATION.md", status: "ASSUMPTION" }], component: Slide02Dilemma,
  },
  {
    id: "local-zone-not-region", title: "Local Zone Is Not a Region", section: "Mental model", duration: "1:30",
    transition: "Replace the map mental model with a parent–extension model.",
    notes: [
      "Hanoi is `ap-southeast-1-han-1a`; the zone group is `ap-southeast-1-han-1`; the parent Region is Singapore (`ap-southeast-1`).",
      "A Local Zone offers selected local services. It does not duplicate the full regional catalog or regional independence model.",
      "When the presenter topology v1 is ready, replace the built-in diagram without changing the thesis.",
    ],
    sources: [{ label: "Available Local Zones", url: awsLocations, status: "VERIFIED" }, { label: "Local Zones FAQ", url: awsFaq, status: "VERIFIED" }], component: Slide03NotARegion,
  },
  {
    id: "opt-in-deploy-verify", title: "Opt In. Deploy. Verify.", section: "Getting started", duration: "1:30",
    transition: "Move from the mental model to one concrete, verifiable placement workflow.",
    notes: [
      "Do not provision live during the talk. Use the command text plus a prerecorded/redacted placement proof.",
      "The command structure is from the AWS guide; the Hanoi group and zone values are from the current availability table.",
      "Before presenting, run all commands in the actual account and validate permissions, opt-in state, subnet and quota.",
    ],
    sources: [{ label: "Getting started with Local Zones", url: awsGettingStarted, status: "VERIFIED" }, { label: "Hanoi zone identifiers", url: awsLocations, status: "VERIFIED" }], component: Slide04OptIn,
  },
  {
    id: "where-data-lives", title: "Where Does Data Actually Live?", section: "Data paths", duration: "2:00",
    transition: "Now that compute placement is clear, trace every durable copy and every processing boundary.",
    notes: [
      "Walk the audience through at-rest, in-transit and in-processing separately.",
      "Call out logs, backups/snapshots and AI/external API payloads—these are often omitted from the first residency diagram.",
      "Control-plane metadata and workload data are different questions. Validate destinations service by service.",
      "Replace with `hanoi-local-zone-parent-region-v2.svg` when the presenter diagram is available.",
    ],
    sources: [{ label: "Local Zones FAQ", url: awsFaq, status: "VERIFIED" }, { label: "EBS Local Snapshots", url: ebsSnapshots, status: "VERIFIED" }], component: Slide05DataLives,
  },
  {
    id: "residency-not-compliance", title: "Residency Is Not Compliance", section: "Legal lens", duration: "2:00",
    transition: "Translate legal requirements into testable architecture evidence without giving legal advice.",
    notes: [
      "Legal disclaimer: nội dung này không phải tư vấn pháp lý. Scope and obligations require qualified Vietnamese counsel.",
      "The brief referenced Decree 13/2023. As of this talk date, use Law 91/2025/QH15 and Decree 356/2025/NĐ-CP as the current primary personal-data framework.",
      "Avoid the blanket claim that all Vietnamese personal data must be stored in Vietnam.",
      "Use the chain: obligation → actual data flow → safeguard → auditable evidence.",
    ],
    sources: [{ label: "Law 91/2025/QH15", url: pdpl, status: "VERIFIED" }, { label: "Decree 356/2025/NĐ-CP", url: decree356, status: "VERIFIED" }, { label: "Decree 53/2022/NĐ-CP", url: decree53, status: "VERIFY" }], component: Slide06Compliance,
  },
  {
    id: "service-reality-check", title: "Service Reality Check", section: "Service boundary", duration: "1:30",
    transition: "Turn the parent–extension model into a concrete service-placement checklist.",
    notes: [
      "Current official matrix lists Hanoi local support for EC2 C7i/M7i/R7i, EBS, ALB, ECS, EKS, VPC, Direct Connect, Application Migration Service and S3 One Zone-IA.",
      "RDS is not listed as locally available in Hanoi. This statement is location-specific and dated.",
      "Regional services can still be consumed through the parent relationship; that is not the same as local deployment.",
      "Recheck families, exact sizes, quota and account availability immediately before the event.",
    ],
    sources: [{ label: "AWS Local Zones features", url: awsFeatures, status: "VERIFIED" }], component: Slide07RealityCheck,
  },
  {
    id: "architectural-gotchas", title: "Three Architectural Gotchas", section: "Constraints", duration: "1:30",
    transition: "Show why a supported service name is not enough to prove application compatibility.",
    notes: [
      "S3 in the Hanoi Local Zone is not a normal regional general-purpose bucket. Confirm directory-bucket API and feature compatibility.",
      "Without local RDS, self-managed database operations include patching, backup, HA, failover and monitoring ownership.",
      "Private connectivity must be drawn end-to-end. Do not say ‘there are no endpoints’; identify the exact service endpoint and route instead.",
    ],
    sources: [{ label: "S3 data residency workloads", url: s3Residency, status: "VERIFIED" }, { label: "Hanoi service matrix", url: awsFeatures, status: "VERIFIED" }], component: Slide08Gotchas,
  },
  {
    id: "moving-compute", title: "Moving Compute Doesn't Move Dependencies", section: "3-tier experiment", duration: "2:00",
    transition: "Set up the three architecture states that the benchmark will compare.",
    notes: [
      "State A is the Singapore baseline. State B moves only the app tier to Hanoi. State C uses a self-managed database in Hanoi.",
      "Do not claim State C is automatically best: it exchanges managed-service breadth and multi-AZ options for locality and higher operational ownership.",
      "Point to synchronous DB round trips in State B—the classic partial-migration trap.",
    ],
    sources: [{ label: "Experiment architecture", url: "README.md", status: "ASSUMPTION" }], component: Slide09Dependencies,
  },
  {
    id: "measure-it", title: "Let's Measure It", section: "Live demo", duration: "3:00",
    transition: "Move from architecture hypotheses to a reproducible measurement plan.",
    notes: [
      "Run `/health`, `/products`, and `/checkout-sim` from a documented Vietnam client location.",
      "Record p50, p95, error rate, sample size, timestamp, network type, TLS/connection reuse and environment shape.",
      "The chart intentionally shows no values. Replace `BENCHMARK_PENDING` only after the lab export is checked into the repo.",
      "Prepare `benchmark-terminal-recording.mp4` so a live-network problem does not consume the talk.",
    ],
    sources: [{ label: "Presenter lab", url: "IMAGES.md", status: "VERIFY" }], component: Slide10Measure,
  },
  {
    id: "migration-not-lift-shift", title: "Migration Is More Than Lift-and-Shift", section: "Migration", duration: "2:00",
    transition: "Turn the demo into a production migration sequence with explicit rollback.",
    notes: [
      "Separate stateless rebuild from stateful replication and consistency controls.",
      "Define rollback criteria before cutover: traffic health, data integrity, accountable owner and deadline.",
      "DNS TTL, IaC parity, observability and teardown are part of the migration plan.",
      "AWS Application Migration Service is listed for Hanoi, but source OS/workload eligibility still needs workload-specific validation.",
    ],
    sources: [{ label: "Hanoi service matrix", url: awsFeatures, status: "VERIFIED" }], component: Slide11Migration,
  },
  {
    id: "one-fault-domain", title: "One Local Zone. One Local Fault Domain.", section: "Resilience", duration: "2:00",
    transition: "Challenge the common diagram error: duplicating instances inside one boundary does not create multi-AZ.",
    notes: [
      "Hanoi currently has one published Local Zone. Two local instances can improve instance-level availability, but not Local-Zone fault-domain independence.",
      "Local snapshots support residency but share the local-location risk. Regional copies change the residency path and must be an explicit decision.",
      "Define RPO, RTO, restore procedure and regional dependency behavior. Test them; do not infer them from the diagram.",
    ],
    sources: [{ label: "AWS Regions and AZs", url: awsAzGuide, status: "VERIFIED" }, { label: "EBS Local Snapshots", url: ebsSnapshots, status: "VERIFIED" }], component: Slide12FaultDomain,
  },
  {
    id: "right-choice", title: "Is Hanoi the Right Choice?", section: "Decision", duration: "3:00",
    transition: "Use the matrix to expose trade-offs, then return to the workload's actual constraint.",
    notes: [
      "All values are qualitative and conditional—not measured rankings.",
      "Full Singapore retains regional breadth and multi-AZ design options but may not satisfy a workload's latency or residency goals.",
      "Hanoi app + Singapore DB can improve some user-facing work while adding cross-location synchronous dependencies.",
      "Full Hanoi self-managed increases local control and operations burden. A Vietnam data provider adds a separate provider/resilience/integration assessment.",
      "AI inference: the GA announcement mentions AI/ML inference use cases, but the published Hanoi EC2 list must be checked against model/runtime requirements; do not imply local Bedrock deployment.",
    ],
    sources: [{ label: "AWS Hanoi GA", url: awsLaunch, status: "VERIFIED" }, { label: "Decision assumptions", url: "CONTENT_VERIFICATION.md", status: "ASSUMPTION" }], component: Slide13RightChoice,
  },
  {
    id: "closer-not-better", title: "Closer Isn't Automatically Better", section: "Close", duration: "1:00",
    transition: "End on the decision principles and invite questions.",
    notes: [
      "Repeat the three distinctions exactly: Local Zone ≠ Region; residency ≠ compliance; lower latency ≠ successful architecture.",
      "Mention AWS Activate only as an official program that eligible startups can explore. Do not state a credit amount or promise eligibility.",
      "Invite questions on the diagrams, lab design, service matrix and legal review—not on invented benchmark outcomes.",
    ],
    sources: [{ label: "AWS Local Zones", url: awsFaq, status: "VERIFIED" }, { label: "AWS Activate", url: activate, status: "VERIFIED" }], component: Slide14Takeaways,
  },
];
