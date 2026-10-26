import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Cable,
  CircleAlert,
  CloudCog,
  Database,
  Gauge,
  Globe2,
  HardDrive,
  MapPin,
  RotateCcw,
  Scale,
  TimerReset,
  Waypoints,
} from "lucide-react";
import hanoiSkyline from "../../hanoi.png";
import { SlideFrame } from "../components/slides/SlideFrame";
import {
  AwsService,
  Eyebrow,
  FlowArrow,
  SlideTitle,
  StatusPill,
  Terminal,
  ZoneBoundary,
} from "../components/slides/SlidePrimitives";

export function Slide01Title() {
  return (
    <SlideFrame index={1} section="OPENING" className="title-slide" source="Presenter-provided Hanoi image · license VERIFY" status="VERIFY">
      <img className="title-slide__photo" src={hanoiSkyline} alt="Hanoi city skyline at night" />
      <div className="title-slide__veil" aria-hidden="true" />
      <div className="title-slide__content">
        <Eyebrow>TECHTALK #01 · 25 MIN · HANOI</Eyebrow>
        <h1 data-animate="title">AWS Hanoi<br /><span>Local Zone</span></h1>
        <p data-animate="content">Architecture, data residency<br />&amp; trade-offs for Vietnam workloads</p>
        <div className="title-slide__speaker" data-animate="content">
          <span>VNT</span>
          <div><strong>Văn Ngọc Thắng</strong><small>Service Delivery Squad · 26 Oct 2026</small></div>
        </div>
      </div>
      <div className="title-slide__locator" data-animate="visual">
        <MapPin aria-hidden="true" />
        <span><strong>HANOI, VIETNAM</strong><small>21.0285° N · 105.8542° E</small></span>
      </div>
    </SlideFrame>
  );
}

export function Slide02Dilemma() {
  return (
    <SlideFrame index={2} section="THE DECISION" className="dilemma-slide" source="Architecture scenario · assumptions stated in notes">
      <div className="slide-heading-block">
        <Eyebrow>THE VIETNAM WORKLOAD DILEMMA</Eyebrow>
        <SlideTitle>Closer users.<br />Distant dependencies.</SlideTitle>
        <p className="slide-deck" data-animate="content">A Singapore-hosted SaaS can be perfectly valid—and still create latency and residency questions for a Vietnam workload.</p>
        <div className="question-callout" data-animate="content"><span>?</span>What would you move first?</div>
      </div>
      <div className="architecture-lane dilemma-architecture">
        <div className="user-cluster" data-animate="visual">
          <Globe2 aria-hidden="true" />
          <strong>Users in Vietnam</strong>
          <small>browser · mobile · office</small>
        </div>
        <FlowArrow label="user path" />
        <ZoneBoundary label="ASIA PACIFIC (SINGAPORE)" meta="ap-southeast-1" tone="region">
          <div className="service-chain">
            <AwsService icon="loadBalancer" label="ALB" />
            <FlowArrow />
            <AwsService icon="ec2" label="App tier" detail="EC2" />
            <FlowArrow />
            <AwsService icon="rds" label="Database" detail="Amazon RDS" />
          </div>
          <AwsService icon="s3" label="Object storage" detail="Regional S3" />
        </ZoneBoundary>
      </div>
      <div className="tension-labels" data-animate="content">
        <span><Gauge aria-hidden="true" /> latency-sensitive path</span>
        <span><Scale aria-hidden="true" /> residency obligations</span>
        <span><CloudCog aria-hidden="true" /> managed-service dependency</span>
      </div>
    </SlideFrame>
  );
}

export function Slide03NotARegion() {
  return (
    <SlideFrame index={3} section="MENTAL MODEL" className="region-slide" source="AWS Local Zones locations + FAQ · checked 2026-10-26" status="VERIFIED">
      <div className="region-slide__heading">
        <Eyebrow>LOCAL ZONE ≠ AWS REGION</Eyebrow>
        <SlideTitle>Hanoi extends<br /><span>Singapore.</span></SlideTitle>
        <p className="slide-deck" data-animate="content">It places selected resources near Hanoi while retaining a parent-Region relationship and access to regional services.</p>
        <div className="fact-strip" data-animate="content"><strong>01</strong><span>published Hanoi Local Zone</span></div>
      </div>
      <div className="paired-boundaries">
        <ZoneBoundary label="HANOI LOCAL ZONE" meta="ap-southeast-1-han-1a" tone="local">
          <div className="zone-stack">
            <AwsService icon="loadBalancer" label="ALB" />
            <AwsService icon="ec2" label="EC2" detail="C7i · M7i · R7i" />
            <AwsService icon="ebs" label="EBS" detail="local volumes" />
          </div>
        </ZoneBoundary>
        <div className="region-links" data-animate="flow">
          <span>regional APIs / control plane</span>
          <ArrowRight aria-hidden="true" />
          <span>service dependencies</span>
          <ArrowRight aria-hidden="true" />
        </div>
        <ZoneBoundary label="PARENT REGION" meta="Asia Pacific (Singapore) · ap-southeast-1" tone="region">
          <div className="zone-stack">
            <AwsService icon="rds" label="RDS" detail="regional" />
            <AwsService icon="lambda" label="Lambda" detail="regional" />
            <AwsService icon="cloudWatch" label="CloudWatch" detail="service integration" />
          </div>
        </ZoneBoundary>
        <div className="asset-slot-mini" data-animate="visual">Replace with <strong>hanoi-local-zone-parent-region-v1.svg</strong> when ready</div>
      </div>
    </SlideFrame>
  );
}

export function Slide04OptIn() {
  const command = `# 1 · discover the Hanoi Local Zone\naws ec2 describe-availability-zones \\\n+  --region ap-southeast-1 \\\n+  --filters Name=zone-type,Values=local-zone \\\n+  --all-availability-zones\n\n# 2 · opt in to the verified zone group\naws ec2 modify-availability-zone-group \\\n+  --region ap-southeast-1 \\\n+  --group-name ap-southeast-1-han-1 \\\n+  --opt-in-status opted-in\n\n# 3 · verify placement after deployment\naws ec2 describe-instances \\\n+  --region ap-southeast-1 \\\n+  --filters Name=availability-zone,Values=ap-southeast-1-han-1a`;

  return (
    <SlideFrame index={4} section="GETTING STARTED" className="procedure-slide" source="AWS Local Zones getting started guide · commands must be run in lab account" status="VERIFIED">
      <div className="procedure-slide__top">
        <div>
          <Eyebrow>CONTROL THE PLACEMENT</Eyebrow>
          <SlideTitle compact>Opt in. Deploy. Verify.</SlideTitle>
        </div>
        <div className="procedure-flow">
          {[
            ["01", "Opt in", "ap-southeast-1-han-1"],
            ["02", "Create subnet", "Local Zone CIDR"],
            ["03", "Deploy", "supported EC2"],
            ["04", "Verify", "…han-1a"],
          ].map(([number, label, detail]) => (
            <div className="procedure-step" key={number} data-animate="content">
              <span>{number}</span><strong>{label}</strong><small>{detail}</small>
            </div>
          ))}
        </div>
      </div>
      <Terminal>{command}</Terminal>
      <p className="terminal-caption" data-animate="content"><BadgeCheck aria-hidden="true" /> Command shape is sourced from AWS documentation. Use a prerecorded, redacted placement proof for the live talk.</p>
    </SlideFrame>
  );
}

export function Slide05DataLives() {
  return (
    <SlideFrame index={5} section="DATA PATHS" className="data-slide" source="Architecture decision model · replace topology with presenter v2 asset" status="ASSET_NEEDED">
      <div className="data-slide__heading">
        <Eyebrow>TRACE EVERY COPY</Eyebrow>
        <SlideTitle compact>Where does data<br />actually live?</SlideTitle>
      </div>
      <div className="data-map">
        <ZoneBoundary label="VIETNAM · HANOI" meta="local data plane" tone="local">
          <AwsService icon="ec2" label="Application compute" detail="in processing" />
          <AwsService icon="ebs" label="Block storage" detail="at rest" />
          <AwsService icon="s3" label="S3 One Zone-IA" detail="directory bucket" />
        </ZoneBoundary>
        <div className="cross-border-path" data-animate="flow">
          <span>queries</span><ArrowRight aria-hidden="true" /><span>telemetry</span><ArrowRight aria-hidden="true" /><span>API payloads</span>
        </div>
        <ZoneBoundary label="SINGAPORE · PARENT REGION" meta="regional dependencies" tone="region">
          <AwsService icon="rds" label="Managed database" detail="regional at rest" />
          <AwsService icon="cloudWatch" label="Logs & metrics" detail="verify destinations" />
          <AwsService icon="bedrock" label="AI / external APIs" detail="payload boundary" />
        </ZoneBoundary>
      </div>
      <div className="data-legend" data-animate="content">
        <span><i className="dot dot--orange" />at rest</span>
        <span><i className="dot dot--cyan" />in transit</span>
        <span><i className="dot dot--paper" />in processing</span>
        <span><i className="dot dot--muted" />control-plane metadata</span>
      </div>
    </SlideFrame>
  );
}

export function Slide06Compliance() {
  return (
    <SlideFrame index={6} section="LEGAL LENS" className="compliance-slide" tone="paper" source="Official VN legal texts · legal review required" status="VERIFY">
      <div className="compliance-slide__headline">
        <Eyebrow>ARCHITECTURE IS EVIDENCE—NOT A LEGAL OPINION</Eyebrow>
        <SlideTitle>Residency is not<br /><span>compliance.</span></SlideTitle>
      </div>
      <div className="evidence-chain">
        {[
          ["01", "Obligation", "Which law, sector rule or contract applies?"],
          ["02", "Data flow", "Where is each copy processed, stored and transferred?"],
          ["03", "Safeguards", "Access, encryption, retention, transfer controls."],
          ["04", "Evidence", "Policies, logs, assessments and accountable owners."],
        ].map(([number, title, body]) => (
          <article key={number} data-animate="content"><span>{number}</span><strong>{title}</strong><p>{body}</p></article>
        ))}
      </div>
      <div className="legal-register" data-animate="visual">
        <div><StatusPill>IN FORCE</StatusPill><strong>91/2025/QH15</strong><span>Personal Data Protection Law · effective 01 Jan 2026</span></div>
        <div><StatusPill>IN FORCE</StatusPill><strong>356/2025/NĐ-CP</strong><span>Implementing decree · effective 01 Jan 2026</span></div>
        <div><StatusPill status="verify">SCOPE REVIEW</StatusPill><strong>53/2022/NĐ-CP</strong><span>Cybersecurity implementing decree</span></div>
      </div>
      <p className="legal-warning" data-animate="content"><CircleAlert aria-hidden="true" /> Do not claim that all Vietnamese personal data must be stored locally. Classify the workload and obtain qualified counsel.</p>
    </SlideFrame>
  );
}

const serviceReality = [
  { icon: "ec2" as const, area: "Compute", state: "LOCAL", detail: "EC2 · C7i, M7i, R7i" },
  { icon: "ebs" as const, area: "Storage", state: "LOCAL", detail: "EBS + Local Snapshots · S3 One Zone-IA" },
  { icon: "ecs" as const, area: "Containers", state: "LOCAL", detail: "ECS and EKS listed" },
  { icon: "vpc" as const, area: "Networking", state: "LOCAL", detail: "VPC · ALB · Direct Connect" },
  { icon: "rds" as const, area: "Database", state: "GAP", detail: "RDS not listed locally in Hanoi" },
  { icon: "lambda" as const, area: "Serverless / AI", state: "REGIONAL", detail: "Not listed as local deployment" },
];

export function Slide07RealityCheck() {
  return (
    <SlideFrame index={7} section="SERVICE BOUNDARY" className="services-slide" source="AWS Local Zones feature matrix · checked 2026-10-26" status="VERIFIED">
      <div className="services-slide__header">
        <div><Eyebrow>LOCATION-SPECIFIC, NOT CATEGORY-WIDE</Eyebrow><SlideTitle compact>Service reality check.</SlideTitle></div>
        <p data-animate="content">“Works with a Local Zone” can mean local deployment, regional orchestration, or regional access. The distinction changes the architecture.</p>
      </div>
      <div className="service-matrix">
        {serviceReality.map((item) => (
          <article className={`service-tile service-tile--${item.state.toLowerCase()}`} key={item.area} data-animate="content">
            <AwsService icon={item.icon} label={item.area} />
            <StatusPill status={item.state === "LOCAL" ? "verified" : item.state === "GAP" ? "verify" : "regional"}>{item.state}</StatusPill>
            <p>{item.detail}</p>
          </article>
        ))}
      </div>
      <p className="matrix-footnote" data-animate="content">Recheck families, sizes, quotas and exact features in the target account before publication or deployment.</p>
    </SlideFrame>
  );
}

export function Slide08Gotchas() {
  const gotchas = [
    {
      number: "01",
      icon: HardDrive,
      title: "S3 is different here",
      body: "Local-Zone S3 uses directory buckets. In Hanoi the listed storage class is S3 One Zone-IA; feature behavior differs from general-purpose regional buckets.",
      tag: "verify application compatibility",
    },
    {
      number: "02",
      icon: Database,
      title: "No local managed RDS",
      body: "The current Hanoi matrix does not list Amazon RDS. Choose a regional database, self-managed database on EC2, or an evaluated Vietnam data provider.",
      tag: "operations move to your team",
    },
    {
      number: "03",
      icon: Cable,
      title: "Private ≠ automatically local",
      body: "Direct Connect, VPN, routes, endpoints and parent-Region service paths must be designed and verified. Avoid blanket claims that endpoints do not exist.",
      tag: "trace the actual network path",
    },
  ];

  return (
    <SlideFrame index={8} section="CONSTRAINTS" className="gotchas-slide" source="AWS S3, EBS and Local Zones documentation · checked 2026-10-26" status="VERIFIED">
      <Eyebrow>THE DETAILS CHANGE THE ANSWER</Eyebrow>
      <SlideTitle compact>Three architectural gotchas.</SlideTitle>
      <div className="gotcha-list">
        {gotchas.map(({ number, icon: Icon, title, body, tag }) => (
          <article key={number} data-animate="content">
            <span className="gotcha-list__number">{number}</span>
            <Icon aria-hidden="true" />
            <div><h3>{title}</h3><p>{body}</p><small>{tag}</small></div>
          </article>
        ))}
      </div>
    </SlideFrame>
  );
}

function MiniArchitecture({ variant }: { variant: "sg" | "split" | "local" }) {
  const isSplit = variant === "split";
  const isLocal = variant === "local";
  return (
    <div className="mini-architecture">
      <div className="mini-zone mini-zone--hanoi">
        <span>HANOI</span>
        {variant === "sg" ? <small>—</small> : <AwsService icon="ec2" label="App" detail="EC2" />}
        {isLocal ? <AwsService icon="ec2" label="PostgreSQL" detail="self-managed" /> : null}
      </div>
      <div className={isSplit ? "mini-link mini-link--hot" : "mini-link"}><ArrowRight aria-hidden="true" /><small>{isSplit ? "DB round trips" : "dependency path"}</small></div>
      <div className="mini-zone mini-zone--sg">
        <span>SINGAPORE</span>
        {variant === "sg" ? <><AwsService icon="ec2" label="App" /><AwsService icon="rds" label="RDS" /></> : null}
        {isSplit ? <AwsService icon="rds" label="RDS" detail="regional" /> : null}
        {isLocal ? <small>DR / regional services</small> : null}
      </div>
    </div>
  );
}

export function Slide09Dependencies() {
  return (
    <SlideFrame index={9} section="3-TIER EXPERIMENT" className="triptych-slide" source="Experiment design · results pending presenter lab">
      <div className="triptych-slide__header">
        <div><Eyebrow>MOVE THE PATH, NOT JUST THE BOX</Eyebrow><SlideTitle compact>Moving compute doesn’t<br />move dependencies.</SlideTitle></div>
        <p data-animate="content">The demo compares architecture states—not a promised performance result.</p>
      </div>
      <div className="architecture-triptych">
        <article data-animate="content"><header><span>A</span><strong>SG app / SG DB</strong></header><MiniArchitecture variant="sg" /><footer>Baseline architecture</footer></article>
        <article className="is-focus" data-animate="content"><header><span>B</span><strong>HN app / SG DB</strong></header><MiniArchitecture variant="split" /><footer>Cross-location query path</footer></article>
        <article data-animate="content"><header><span>C</span><strong>HN app / HN DB</strong></header><MiniArchitecture variant="local" /><footer>Local path · higher ops burden</footer></article>
      </div>
      <div className="triptych-thesis" data-animate="visual"><TimerReset aria-hidden="true" /><span>Application latency is the sum of every synchronous dependency—not the distance to one compute instance.</span></div>
    </SlideFrame>
  );
}

export function Slide10Measure() {
  const command = `$ ./run-benchmark --client vietnam \\\n+  --targets sg-baseline,hn-app-sg-db,hn-full \\\n+  --routes /health,/products,/checkout-sim\n\nEnvironment:  LAB_DETAILS_NEEDED\nSample size:  SAMPLE_SIZE_NEEDED\nTimestamp:    RUN_TIMESTAMP_NEEDED\nResults:      BENCHMARK_PENDING`;
  return (
    <SlideFrame index={10} section="LIVE DEMO" className="benchmark-slide" source="Presenter lab required · no measured result supplied" status="BENCHMARK_PENDING">
      <div className="benchmark-slide__header">
        <div><Eyebrow>MEASURE THE WHOLE REQUEST PATH</Eyebrow><SlideTitle compact>Let’s measure it.</SlideTitle></div>
        <div className="metric-chips" data-animate="content"><span>p50 / p95</span><span>error rate</span><span>n + conditions</span></div>
      </div>
      <div className="benchmark-grid">
        <div>
          <Terminal title="benchmark runner / prerecorded fallback">{command}</Terminal>
          <div className="endpoint-list" data-animate="content"><span>GET /health</span><span>GET /products</span><span>POST /checkout-sim</span></div>
        </div>
        <div className="pending-chart" data-animate="visual">
          <div className="pending-chart__axis"><span>p95</span><span>p50</span><span>0</span></div>
          <div className="pending-chart__plot">
            {['SG baseline','HN app / SG DB','HN full'].map((label) => <div key={label}><i /><span>{label}</span></div>)}
          </div>
          <strong>BENCHMARK_PENDING</strong>
          <p>Bars appear only after real results are supplied.</p>
        </div>
      </div>
      <div className="recording-slot" data-animate="content"><RotateCcw aria-hidden="true" /> Fallback asset: <strong>benchmark-terminal-recording.mp4</strong></div>
    </SlideFrame>
  );
}

export function Slide11Migration() {
  const steps = ["Discover", "Assess", "Build", "Replicate", "Cut over", "Validate"];
  return (
    <SlideFrame index={11} section="MIGRATION" className="migration-slide" source="Migration framework · MGN eligibility must be validated per workload" status="VERIFY">
      <div className="migration-slide__header"><Eyebrow>DESIGN THE REVERSAL BEFORE THE MOVE</Eyebrow><SlideTitle compact>Migration is more than<br />lift-and-shift.</SlideTitle></div>
      <div className="migration-flow">
        {steps.map((step, index) => (
          <div key={step} data-animate="content"><span>{String(index + 1).padStart(2, "0")}</span><strong>{step}</strong>{index < steps.length - 1 ? <ArrowRight aria-hidden="true" /> : null}</div>
        ))}
      </div>
      <div className="migration-lanes">
        <article data-animate="content"><header><Boxes aria-hidden="true" /><strong>Stateless lane</strong></header><p>Images · configuration · IaC · health checks · DNS shift</p><div><StatusPill>REPEATABLE</StatusPill><AwsService icon="cloudFormation" label="Infrastructure as code" /></div></article>
        <article data-animate="content"><header><Database aria-hidden="true" /><strong>Stateful lane</strong></header><p>Replication · consistency · write freeze · backup · restore test</p><div><StatusPill status="verify">WORKLOAD-SPECIFIC</StatusPill><AwsService icon="mgn" label="MGN eligibility" muted /></div></article>
      </div>
      <div className="rollback-ribbon" data-animate="visual"><RotateCcw aria-hidden="true" /><strong>Rollback gate</strong><span>traffic criteria · data integrity · owner · deadline</span></div>
    </SlideFrame>
  );
}

export function Slide12FaultDomain() {
  return (
    <SlideFrame index={12} section="RESILIENCE" className="fault-slide" source="AWS Regions/AZ guidance + EBS Local Snapshots documentation" status="VERIFIED">
      <div className="fault-slide__header">
        <div><Eyebrow>PLACEMENT IS NOT REDUNDANCY</Eyebrow><SlideTitle compact>One Local Zone.<br />One local fault domain.</SlideTitle></div>
        <p data-animate="content">Two instances in the same Hanoi Local Zone do not create a multi-AZ architecture.</p>
      </div>
      <div className="fault-topology">
        <ZoneBoundary label="HANOI LOCAL ZONE" meta="ap-southeast-1-han-1a" tone="danger" className="fault-domain">
          <div className="instance-pair"><AwsService icon="ec2" label="Instance A" /><AwsService icon="ec2" label="Instance B" /></div>
          <div className="local-backup"><AwsService icon="ebs" label="Local snapshot" detail="same Local Zone option" /></div>
          <span className="fault-domain__label">shared local fault-domain boundary</span>
        </ZoneBoundary>
        <div className="dr-path" data-animate="flow"><ArrowRight aria-hidden="true" /><strong>explicit DR path</strong><small>test restore + failover</small></div>
        <ZoneBoundary label="OFF-SITE / PARENT REGION" meta="Singapore" tone="region">
          <AwsService icon="drs" label="DR target" detail="design choice" />
          <AwsService icon="ebs" label="Regional snapshot copy" detail="residency decision" />
        </ZoneBoundary>
      </div>
      <div className="rpo-rto" data-animate="content"><span>RPO <strong>DEFINE</strong></span><span>RTO <strong>DEFINE</strong></span><span>Failover <strong>TEST</strong></span><span>Regional dependency <strong>MAP</strong></span></div>
    </SlideFrame>
  );
}

const choices = [
  { name: "Full Singapore", code: "SG / SG", values: ["baseline", "cross-border", "multi-AZ options", "broad", "lower"], accent: false },
  { name: "Hanoi app + SG DB", code: "HN / SG", values: ["user path may improve", "DB crosses", "split failure modes", "mixed", "medium"], accent: true },
  { name: "Full Hanoi self-managed", code: "HN / HN", values: ["local path", "local", "single local zone", "selected", "high"], accent: false },
  { name: "Hanoi + VN provider", code: "HN / VN", values: ["local path", "local", "provider-dependent", "integration-dependent", "medium–high"], accent: false },
];

export function Slide13RightChoice() {
  return (
    <SlideFrame index={13} section="DECISION" className="choice-slide" tone="paper" source="Qualitative assessment only · validate workload assumptions" status="VERIFY">
      <div className="choice-slide__header">
        <div><Eyebrow>THERE IS NO UNIVERSAL WINNER</Eyebrow><SlideTitle compact>Is Hanoi the right choice?</SlideTitle></div>
        <p data-animate="content">Treat this as a decision workshop—not a scorecard.</p>
      </div>
      <div className="choice-matrix" data-animate="visual">
        <div className="choice-matrix__labels"><span>Option</span><span>User latency</span><span>Residency path</span><span>Resilience</span><span>Service breadth</span><span>Ops burden</span></div>
        {choices.map((choice) => (
          <article className={choice.accent ? "is-accent" : ""} key={choice.name}>
            <header><small>{choice.code}</small><strong>{choice.name}</strong></header>
            {choice.values.map((value, index) => <div key={`${choice.code}-${index}`}><span>{value}</span></div>)}
          </article>
        ))}
      </div>
      <div className="assumption-bar" data-animate="content"><CircleAlert aria-hidden="true" /> Conditional on workload shape, data classification, network path, support matrix, failure model and measured TCO.</div>
    </SlideFrame>
  );
}

export function Slide14Takeaways() {
  const takeaways = [
    ["01", "Local Zone", "is not a Region."],
    ["02", "Residency", "is not compliance."],
    ["03", "Lower latency", "is not successful architecture."],
  ];
  return (
    <SlideFrame index={14} section="CLOSE" className="takeaway-slide" source="AWS Activate: aws.amazon.com/startups/credits" status="VERIFIED">
      <div className="takeaway-slide__glow" aria-hidden="true" />
      <div className="takeaway-slide__heading">
        <Eyebrow>THE DECISION IN THREE LINES</Eyebrow>
        <SlideTitle>Closer isn’t<br />automatically better.</SlideTitle>
      </div>
      <div className="takeaway-list">
        {takeaways.map(([number, lead, rest]) => <div key={number} data-animate="content"><span>{number}</span><p><strong>{lead}</strong> {rest}</p></div>)}
      </div>
      <div className="activate-note" data-animate="visual">
        <Waypoints aria-hidden="true" />
        <div><small>EXPLORE</small><strong>AWS Activate for eligible startups</strong><span>aws.amazon.com/startups/credits</span></div>
        <ArrowRight aria-hidden="true" />
      </div>
    </SlideFrame>
  );
}
