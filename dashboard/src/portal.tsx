import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Box,
  CheckCircle2,
  ChevronRight,
  CircleOff,
  Cloud,
  Code2,
  Database,
  Download,
  ExternalLink,
  FileClock,
  Gauge,
  Globe2,
  HardDrive,
  Info,
  Layers3,
  Menu,
  Network,
  Play,
  Server,
  Settings2,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";

export type ScenarioKey =
  | "AWS_REAL_SINGAPORE"
  | "AWS_REAL_HANOI"
  | "AWS_REAL_HYBRID";
export type MetricKey =
  | "p50"
  | "p95"
  | "p99"
  | "mean"
  | "min"
  | "max"
  | "standardDeviation";
export type Summary = {
  scenario: ScenarioKey;
  queryCount: number;
  samplesRequested: number;
  warmupsExcluded: number;
  metrics: Record<MetricKey, number> & {
    count: number;
    errors: number;
    errorRate: number;
  };
};
export type RawSample = {
  timestamp: string;
  scenario: ScenarioKey;
  origin: string;
  endpoint: string;
  queryCount: number;
  sample: number;
  status: number;
  ok: boolean;
  clientElapsedMs: number;
  serverAppMs: number | null;
  serverDbMs: number | null;
};
export type HistoricalEvidence = {
  runId: string;
  status: string;
  mode: string;
  startedAt: string;
  completedAt: string;
  configuration: {
    samplesPerGroup: number;
    warmupsPerGroup: number;
    queryCounts: number[];
    concurrency: number;
    origin: string;
  };
  summaries: Summary[];
  rawSamples: RawSample[];
  limitations: string[];
};

const historicalRunId = "383ff454-5dd0-449f-ab75-b56ba62c0bd3";
const scenarioMeta: Record<
  ScenarioKey,
  {
    short: string;
    title: string;
    color: string;
    path: string;
    why: string;
    takeaway: string;
  }
> = {
  AWS_REAL_SINGAPORE: {
    short: "Singapore",
    title: "Case 1 — Singapore Regional",
    color: "#5cb6ff",
    path: "Browser → Singapore API → Singapore PostgreSQL",
    why: "A Regional baseline with broad AWS service availability and co-located application/database access.",
    takeaway:
      "Measures client-to-Singapore HTTP latency plus local database work.",
  },
  AWS_REAL_HANOI: {
    short: "Hanoi",
    title: "Case 2 — Hanoi Local Zone",
    color: "#35d39b",
    path: "Browser → Hanoi API → Hanoi PostgreSQL",
    why: "Tests application locality on EC2 with encrypted EBS in ap-southeast-1-han-1a.",
    takeaway:
      "Lower measured latency from this client does not prove full Vietnam data residency.",
  },
  AWS_REAL_HYBRID: {
    short: "Hybrid",
    title: "Case 3 — SG API → Hanoi DB",
    color: "#f2b85b",
    path: "Browser → Singapore API → private VPC → Hanoi PostgreSQL",
    why: "Shows the cost of placing chatty application logic away from its database.",
    takeaway:
      "Sequential SQL round trips amplify the cross-location path at 1/5/10/20 queries.",
  },
};
const routes = [
  ["/", "Overview"],
  ["/learn", "Learn"],
  ["/scenarios", "Scenarios"],
  ["/setup", "Setup"],
  ["/infra", "Infrastructure"],
  ["/benchmarks", "Benchmarks"],
  ["/operations", "Operations"],
  ["/demo", "Live demo"],
] as const;

export function routeForPath(path: string) {
  return routes.some(([route]) => route === path) ? path : "/";
}
export function parseHistoricalEvidence(value: string) {
  return JSON.parse(value.replace(/^\uFEFF/, "")) as HistoricalEvidence;
}
export function evidenceState(
  liveAvailable: boolean,
  evidence?: HistoricalEvidence | null,
) {
  if (liveAvailable) return "LIVE AWS_REAL";
  if (evidence?.runId === historicalRunId) return "HISTORICAL AWS_REAL";
  return "NOT_DEPLOYED";
}
export function visibleSummaries(
  evidence: HistoricalEvidence,
  selected: Set<ScenarioKey>,
) {
  return evidence.summaries
    .filter((item) => selected.has(item.scenario))
    .sort((a, b) => a.queryCount - b.queryCount);
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "bad" | "blue";
}) {
  return (
    <span className={`portal-pill ${tone}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}
function PageTitle({
  eyebrow,
  title,
  copy,
  aside,
}: {
  eyebrow: string;
  title: string;
  copy: string;
  aside?: ReactNode;
}) {
  return (
    <header className="portal-page-title">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {aside}
    </header>
  );
}
function Term({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="term" tabIndex={0}>
      {label}
      <span role="tooltip">{children}</span>
    </span>
  );
}

export function Portal() {
  const [path, setPath] = useState(() => routeForPath(location.pathname));
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const onPop = () => setPath(routeForPath(location.pathname));
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  const navigate = (next: string) => {
    history.pushState(null, "", next);
    setPath(next);
    setMenu(false);
    scrollTo({ top: 0, behavior: "auto" });
  };
  return (
    <div className="portal-shell">
      <a className="skip-link" href="#portal-content">
        Skip to content
      </a>
      <header className="portal-topbar">
        <a
          className="portal-brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            navigate("/");
          }}
        >
          <span>
            <Cloud aria-hidden="true" />
          </span>
          <div>
            <strong>AWS HANOI LOCAL ZONE LAB</strong>
            <small>Educational architecture & evidence portal</small>
          </div>
        </a>
        <button
          className="portal-menu"
          aria-label={menu ? "Close navigation" : "Open navigation"}
          aria-expanded={menu}
          onClick={() => setMenu((value) => !value)}
        >
          {menu ? <X /> : <Menu />}
        </button>
        <nav className={menu ? "open" : ""} aria-label="Primary navigation">
          {routes.map(([route, label]) => (
            <a
              key={route}
              href={route}
              aria-current={path === route ? "page" : undefined}
              onClick={(event) => {
                if (route === "/demo") return;
                event.preventDefault();
                navigate(route);
              }}
            >
              {label}
            </a>
          ))}
        </nav>
        <Pill tone="warn">AWS NOT DEPLOYED</Pill>
      </header>
      <main id="portal-content" className="portal-main">
        {path === "/" ? (
          <Overview navigate={navigate} />
        ) : path === "/learn" ? (
          <Learn />
        ) : path === "/scenarios" ? (
          <Scenarios />
        ) : path === "/setup" ? (
          <Setup />
        ) : path === "/infra" ? (
          <Infrastructure />
        ) : path === "/benchmarks" ? (
          <Benchmarks />
        ) : path === "/operations" ? (
          <Operations />
        ) : (
          <Overview navigate={navigate} />
        )}
      </main>
      <footer className="portal-footer">
        <span>
          Historical evidence is preserved; the previous AWS environment is not
          running.
        </span>
        <span>
          No unrestricted browser shell · no secret values · no inferred
          residency
        </span>
      </footer>
    </div>
  );
}

function Overview({ navigate }: { navigate: (path: string) => void }) {
  return (
    <>
      <PageTitle
        eyebrow="CLONE · LEARN · MEASURE · EXPLAIN"
        title="Understand where latency really comes from."
        copy="A reusable technical lab for comparing Singapore Regional, Hanoi Local Zone and a hybrid Singapore-to-Hanoi database path—without pretending that destroyed infrastructure is live."
        aside={
          <div className="hero-status">
            <Pill tone="bad">NOT_DEPLOYED</Pill>
            <span>EC2 0 · EBS 0 · EIP 0</span>
            <small>Read-only AWS preflight verified 3 Nov 2026</small>
          </div>
        }
      />
      <section className="portal-callout">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Safe current state</strong>
          <p>
            Terraform resources: 0. Two Secrets Manager secrets remain pending
            deletion. Historical AWS_REAL run <code>{historicalRunId}</code> is
            available for study and is never mixed with new measurements.
          </p>
        </div>
      </section>
      <section className="overview-grid">
        <article className="portal-card overview-lead">
          <p className="eyebrow">THE QUESTION</p>
          <h2>
            Does moving a workload closer to Hanoi improve the customer
            experience?
          </h2>
          <p>
            The answer depends on where the API, database and client are
            located—and on how many sequential network round trips the
            application performs.
          </p>
          <div className="button-row">
            <button onClick={() => navigate("/scenarios")}>
              Explore architectures <ArrowRight />
            </button>
            <button
              className="secondary"
              onClick={() => navigate("/benchmarks")}
            >
              Inspect real evidence <Gauge />
            </button>
          </div>
        </article>
        <ArchitectureMini />
      </section>
      <section className="three-cards">
        {Object.entries(scenarioMeta).map(([key, item]) => (
          <article
            className="portal-card scenario-summary"
            key={key}
            style={{ "--scenario-color": item.color } as React.CSSProperties}
          >
            <span className="scenario-index">
              {key.endsWith("SINGAPORE")
                ? "01"
                : key.endsWith("HANOI")
                  ? "02"
                  : "03"}
            </span>
            <h2>{item.short}</h2>
            <p>{item.path}</p>
            <strong>{item.takeaway}</strong>
          </article>
        ))}
      </section>
      <section className="portal-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">EVIDENCE CONTRACT</p>
            <h2>Every claim carries provenance.</h2>
          </div>
        </div>
        <div className="state-grid">
          <StateCard
            label="LIVE AWS_REAL"
            detail="Only current endpoints revalidated against AWS and runtime topology."
            tone="ok"
          />
          <StateCard
            label="HISTORICAL AWS_REAL"
            detail="Retained immutable evidence with run ID, origin and timestamp."
            tone="warn"
          />
          <StateCard
            label="LOCAL_EMULATION"
            detail="Real HTTP/PostgreSQL operations; operator-defined geography and delay."
            tone="blue"
          />
          <StateCard
            label="NOT_DEPLOYED"
            detail="Planned architecture only. No fabricated resource IDs or live metrics."
            tone="bad"
          />
        </div>
      </section>
    </>
  );
}

function ArchitectureMini() {
  return (
    <article className="portal-card architecture-mini">
      <div className="static-path">
        <Globe2 />
        <span>Static frontend</span>
        <ChevronRight />
        <Cloud />
        <span>Singapore S3</span>
      </div>
      <div className="physical-nodes">
        <div>
          <Server />
          <strong>SG EC2</strong>
          <small>SG API · Hybrid API · SG PostgreSQL</small>
        </div>
        <span className="private-link">
          <Network />
          private VPC
        </span>
        <div>
          <Server />
          <strong>Hanoi EC2</strong>
          <small>Hanoi API · Hanoi PostgreSQL · encrypted EBS</small>
        </div>
      </div>
      <p>
        S3 delivers static files. It is not in the API-to-database request path.
      </p>
    </article>
  );
}

function StateCard({
  label,
  detail,
  tone,
}: {
  label: string;
  detail: string;
  tone: "ok" | "warn" | "blue" | "bad";
}) {
  return (
    <article className="portal-card state-card">
      <Pill tone={tone}>{label}</Pill>
      <p>{detail}</p>
    </article>
  );
}

function Learn() {
  return (
    <>
      <PageTitle
        eyebrow="CONCEPTS"
        title="One factual model, two explanation levels."
        copy="Use Simple mode for customers and first-time learners; use Technical mode to inspect placement, request paths and measurement boundaries."
      />
      <section className="learn-grid">
        <article className="portal-card">
          <BookOpen />
          <p className="eyebrow">SIMPLE</p>
          <h2>Think in round trips</h2>
          <p>
            A nearby application can answer sooner. But if the application
            repeatedly talks to a distant database, each conversation adds
            waiting time.
          </p>
          <ul>
            <li>Hanoi placement can reduce latency for nearby clients.</li>
            <li>
              A Local Zone has fewer services and a smaller failure boundary
              than a full Region.
            </li>
            <li>
              Moving only the database can make a chatty application slower.
            </li>
          </ul>
        </article>
        <article className="portal-card">
          <Code2 />
          <p className="eyebrow">TECHNICAL</p>
          <h2>Measure each boundary</h2>
          <p>
            The benchmark records end-to-end HTTP time, Fastify application
            time, aggregate PostgreSQL time and individual sequential SQL
            timings.
          </p>
          <ul>
            <li>Two EC2 instances host all logical tiers.</li>
            <li>Hanoi data uses PostgreSQL on encrypted gp3 EBS.</li>
            <li>Hybrid traffic stays on private VPC networking.</li>
          </ul>
        </article>
      </section>
      <section className="portal-card glossary">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GLOSSARY</p>
            <h2>Terms used in the lab</h2>
          </div>
        </div>
        <div>
          {[
            [
              "RTT",
              "Round-trip time: a request travels to a destination and its response returns.",
            ],
            ["latency", "Elapsed delay observed for an operation."],
            [
              "jitter",
              "Variation in packet delay; HTTP latency variation is not the same measurement.",
            ],
            [
              "p50 / p95 / p99",
              "Percentiles: 50%, 95% or 99% of samples finish at or below this value.",
            ],
            [
              "Local Zone",
              "AWS infrastructure near a population center, connected to a parent Region.",
            ],
            [
              "AZ",
              "Availability Zone: an isolated location within an AWS Region or Local Zone group.",
            ],
            ["EBS", "Persistent block storage attached to EC2."],
            [
              "SG",
              "Singapore in this lab; security group when used in AWS resource context.",
            ],
            ["SSO", "Short-lived workforce authentication to AWS."],
            [
              "data residency",
              "Where regulated data is stored and processed; location labels alone do not prove it.",
            ],
            [
              "hybrid architecture",
              "An application split across locations or providers.",
            ],
          ].map(([term, definition]) => (
            <div key={term}>
              <strong>{term}</strong>
              <p>{definition}</p>
            </div>
          ))}
        </div>
        <p className="tooltip-example">
          Contextual example:{" "}
          <Term label="p95">
            95% of measured requests completed at or below this duration.
          </Term>
        </p>
      </section>
    </>
  );
}

const scenarioDetails = [
  {
    key: "AWS_REAL_SINGAPORE" as ScenarioKey,
    resources:
      "Singapore EC2: SG API + hybrid API + PostgreSQL; static frontend in Singapore S3.",
    request:
      "Browser fetches static files from S3, then calls the SG API; Fastify executes sequential SQL against co-located PostgreSQL.",
    metrics:
      "HTTP p50/p95/p99, application time, database time, mean/min/max/std dev, error and timeout rates.",
    result: "Verified historical baseline across 1/5/10/20 sequential queries.",
    limits:
      "Client ISP, t3.small CPU credits, load and cache state affect fairness.",
    fit: "Regional service breadth, multi-service integration and a conventional baseline.",
  },
  {
    key: "AWS_REAL_HANOI" as ScenarioKey,
    resources:
      "Hanoi c7i.large EC2: API + PostgreSQL; encrypted 30 GiB root and 10 GiB gp3 database volume.",
    request:
      "Browser calls the Hanoi EIP; API and database work execute on the same Hanoi EC2.",
    metrics: "Same factual metrics and workloads as Singapore.",
    result:
      "Verified lower client latency from the measured Vietnam presenter origin.",
    limits:
      "Single Local Zone placement; Hanoi deployment does not prove every data copy remains in Vietnam.",
    fit: "Latency-sensitive Vietnam-facing compute supported by the Local Zone service catalog.",
  },
  {
    key: "AWS_REAL_HYBRID" as ScenarioKey,
    resources:
      "Hybrid API on SG EC2; PostgreSQL on Hanoi EC2; security-group-to-self TCP 5432 over the VPC.",
    request:
      "Browser calls Singapore; each sequential SQL query crosses the SG–Hanoi private path before HTTP completes.",
    metrics: "Same HTTP metrics plus aggregate and per-query SQL durations.",
    result:
      "Verified near-linear amplification: 20 sequential queries dominated total response time.",
    limits:
      "No invented hop timing; measured application/DB durations are not packet RTT.",
    fit: "Transitional architectures, controlled dependencies, or workloads redesigned to batch/cache queries.",
  },
];
function Scenarios() {
  const [level, setLevel] = useState<"SIMPLE" | "TECHNICAL">("SIMPLE");
  return (
    <>
      <PageTitle
        eyebrow="THREE VERIFIED ARCHITECTURES"
        title="Follow the request, not the marketing label."
        copy="All scenarios use the same retained evidence. The explanation level changes detail, never facts."
        aside={
          <div
            className="segmented"
            role="group"
            aria-label="Explanation level"
          >
            <button
              aria-pressed={level === "SIMPLE"}
              onClick={() => setLevel("SIMPLE")}
            >
              Simple
            </button>
            <button
              aria-pressed={level === "TECHNICAL"}
              onClick={() => setLevel("TECHNICAL")}
            >
              Technical
            </button>
          </div>
        }
      />
      <section className="scenario-list">
        {scenarioDetails.map((detail, index) => {
          const meta = scenarioMeta[detail.key];
          return (
            <article
              className="portal-card scenario-deep"
              key={detail.key}
              style={{ "--scenario-color": meta.color } as React.CSSProperties}
            >
              <header>
                <span>0{index + 1}</span>
                <div>
                  <p className="eyebrow">
                    {detail.key.replace("AWS_REAL_", "")}
                  </p>
                  <h2>{meta.title}</h2>
                  <p>{meta.why}</p>
                </div>
                <Pill tone="warn">HISTORICAL AWS_REAL</Pill>
              </header>
              <RequestDiagram scenario={detail.key} />
              {level === "SIMPLE" ? (
                <div className="simple-answer">
                  <div>
                    <strong>What happens?</strong>
                    <p>
                      {meta.path}. {detail.request}
                    </p>
                  </div>
                  <div>
                    <strong>What did it teach us?</strong>
                    <p>{meta.takeaway}</p>
                  </div>
                  <div>
                    <strong>When does it make sense?</strong>
                    <p>{detail.fit}</p>
                  </div>
                </div>
              ) : (
                <dl className="technical-facts">
                  <div>
                    <dt>Actual resources</dt>
                    <dd>{detail.resources}</dd>
                  </div>
                  <div>
                    <dt>Request & operations</dt>
                    <dd>{detail.request}</dd>
                  </div>
                  <div>
                    <dt>Measured</dt>
                    <dd>{detail.metrics}</dd>
                  </div>
                  <div>
                    <dt>Verified result</dt>
                    <dd>{detail.result}</dd>
                  </div>
                  <div>
                    <dt>Limitations</dt>
                    <dd>{detail.limits}</dd>
                  </div>
                  <div>
                    <dt>Architecture fit</dt>
                    <dd>{detail.fit}</dd>
                  </div>
                </dl>
              )}
            </article>
          );
        })}
      </section>
      <section className="portal-callout">
        <Info />
        <div>
          <strong>Cases 4–5 remain educational only</strong>
          <p>
            Logical migration, backup, EBS Local Snapshot and recovery are not
            AWS_REAL verified. A second Vietnam-based provider is a theoretical
            DR option; none is provisioned.
          </p>
        </div>
      </section>
    </>
  );
}

function RequestDiagram({ scenario }: { scenario: ScenarioKey }) {
  const hanoi = scenario === "AWS_REAL_HANOI",
    hybrid = scenario === "AWS_REAL_HYBRID";
  return (
    <div className="request-diagram">
      <div>
        <Globe2 />
        <strong>Browser</strong>
        <small>measured client origin</small>
      </div>
      <ChevronRight />
      <div className={hanoi ? "han" : "sg"}>
        <Server />
        <strong>{hanoi ? "Hanoi" : "Singapore"} API</strong>
        <small>Fastify on EC2</small>
      </div>
      <ChevronRight />
      <div className={hanoi || hybrid ? "han" : "sg"}>
        <Database />
        <strong>{hanoi || hybrid ? "Hanoi" : "Singapore"} PostgreSQL</strong>
        <small>
          {hybrid ? "private VPC · sequential SQL" : "co-located on EC2 + EBS"}
        </small>
      </div>
    </div>
  );
}

const setupSteps = [
  [
    "Local dependencies",
    "Node 22+, Docker Desktop, PowerShell 7, Terraform and AWS CLI v2.",
  ],
  [
    "AWS profile and SSO",
    "Select an authorized profile; run SSO login explicitly when required.",
  ],
  [
    "Local Zone access and quotas",
    "Read-only check for ap-southeast-1-han-1a opt-in and EC2 quota.",
  ],
  [
    "Configuration and CIDR",
    "Copy examples; detect public IPv4 as a proposal and verify the /32.",
  ],
  [
    "Build artifacts and Terraform plan",
    "Build locally, initialize Terraform and create a saved plan only.",
  ],
  [
    "Cost/resource review",
    "Inspect exact EC2/EBS/EIP/S3/Secrets inventory and estimates.",
  ],
  [
    "Explicitly approved deployment",
    "Out of scope here. Apply requires separate human approval after plan review.",
  ],
  [
    "Infrastructure and application verification",
    "Validate tags, AZ, EBS, endpoints, topology and PostgreSQL connectivity.",
  ],
  [
    "Run benchmarks",
    "5 excluded warm-ups + 100 measured requests for 1/5/10/20 SQL queries.",
  ],
  [
    "Safe cleanup",
    "Preview inventory first; cleanup is separately approved and verified to zero.",
  ],
];
function Setup() {
  return (
    <>
      <PageTitle
        eyebrow="FRESH CLONE WORKFLOW"
        title="From laptop to a safe rehearsal."
        copy="The wizard separates local rehearsal from billable AWS actions. Nothing in this page silently opts in a zone, broadens a security group or deploys resources."
      />
      <section className="setup-layout">
        <ol className="setup-timeline">
          {setupSteps.map(([title, detail], index) => (
            <li className="portal-card" key={title}>
              <span>{index + 1}</span>
              <div>
                <h2>{title}</h2>
                <p>{detail}</p>
                {index === 0 ? (
                  <code>.\lab.ps1 doctor</code>
                ) : index === 1 ? (
                  <code>aws sso login --profile &lt;profile&gt;</code>
                ) : index === 4 ? (
                  <code>
                    .\lab.ps1 artifacts; .\lab.ps1 plan -Profile &lt;profile&gt;
                    -PresenterCidr &lt;verified-ip/32&gt;
                  </code>
                ) : index === 8 ? (
                  <code>.\lab.ps1 local; .\lab.ps1 verify</code>
                ) : index === 9 ? (
                  <code>
                    .\lab.ps1 cleanup-preview -Profile &lt;profile&gt;
                  </code>
                ) : null}
              </div>
              <Pill
                tone={
                  index === 6 || index === 9
                    ? "bad"
                    : index < 6
                      ? "blue"
                      : "neutral"
                }
              >
                {index === 6
                  ? "APPROVAL REQUIRED"
                  : index === 9
                    ? "READ-ONLY PREVIEW"
                    : "GUIDED"}
              </Pill>
            </li>
          ))}
        </ol>
        <aside className="portal-card setup-aside">
          <p className="eyebrow">OPERATOR BOUNDARIES</p>
          <h2>Never hidden behind automation</h2>
          <ul>
            <li>AWS account opt-in and IAM permissions</li>
            <li>SSO authorization and profile choice</li>
            <li>Presenter IPv4 /32 verification</li>
            <li>Terraform plan and cost review</li>
            <li>Apply, destroy, migration and snapshots</li>
          </ul>
          <p>
            Pending-deletion secret name conflicts must be resolved
            deliberately; the wizard does not restore or purge secrets.
          </p>
        </aside>
      </section>
    </>
  );
}

function Infrastructure() {
  const [view, setView] = useState<"architecture" | "execution">(
    "architecture",
  );
  return (
    <>
      <PageTitle
        eyebrow="INFRASTRUCTURE EXPLORER"
        title="Planned topology, honest deployment state."
        copy="Because the previous environment was destroyed, this explorer labels every AWS component as planned rather than displaying fabricated actual resources."
        aside={
          <div className="segmented">
            <button
              aria-pressed={view === "architecture"}
              onClick={() => setView("architecture")}
            >
              Architecture
            </button>
            <button
              aria-pressed={view === "execution"}
              onClick={() => setView("execution")}
            >
              Execution
            </button>
          </div>
        }
      />
      {view === "architecture" ? (
        <>
          <section className="portal-card infra-map">
            <Pill tone="bad">EXPECTED ≠ ACTUAL · NOT_DEPLOYED</Pill>
            <div className="infra-region">
              <header>
                <Cloud />
                <strong>ap-southeast-1</strong>
                <small>Singapore parent Region</small>
              </header>
              <div className="infra-subnets">
                <div>
                  <span>ap-southeast-1a</span>
                  <Server />
                  <strong>SG EC2</strong>
                  <small>SG API · Hybrid API · PostgreSQL</small>
                  <HardDrive />
                  <small>encrypted EBS</small>
                </div>
                <div className="vpc-line">
                  <Network />
                  <strong>private VPC</strong>
                  <small>PostgreSQL TCP 5432 · SG self-reference</small>
                </div>
                <div>
                  <span>ap-southeast-1-han-1a</span>
                  <Server />
                  <strong>Hanoi EC2</strong>
                  <small>Hanoi API · PostgreSQL</small>
                  <HardDrive />
                  <small>encrypted gp3 EBS</small>
                </div>
              </div>
              <div className="infra-services">
                <div>
                  <Box />
                  <strong>Singapore S3</strong>
                  <small>static frontend</small>
                </div>
                <div>
                  <Box />
                  <strong>Private artifact bucket</strong>
                  <small>bootstrap images</small>
                </div>
                <div>
                  <ShieldCheck />
                  <strong>Secrets Manager</strong>
                  <small>2 pending deletion</small>
                </div>
              </div>
            </div>
          </section>
          <section className="inventory-grid">
            {[
              ["EC2 instances", "0 actual", "2 planned logical hosts"],
              ["EBS volumes", "0 actual", "root + DB volume per host"],
              ["Elastic IPs", "0 actual", "separate network border groups"],
              [
                "S3 buckets",
                "0 active project buckets",
                "frontend + private artifacts",
              ],
              [
                "Secrets",
                "0 active · 2 pending deletion",
                "database credentials",
              ],
              [
                "Terraform resources",
                "0 active",
                "protected backup remains historical",
              ],
            ].map(([name, state, detail]) => (
              <article className="portal-card" key={name}>
                <strong>{name}</strong>
                <b>{state}</b>
                <small>{detail}</small>
              </article>
            ))}
          </section>
          <p className="cost-note">
            <Info /> Cost figures in plans are estimates, never actual AWS
            billing.
          </p>
        </>
      ) : (
        <ExecutionView />
      )}
    </>
  );
}
function ExecutionView() {
  const steps = [
    ["Preflight", ".\\lab.ps1 doctor -Profile <profile>", "AVAILABLE"],
    ["Build artifacts", ".\\lab.ps1 artifacts", "AVAILABLE"],
    [
      "Terraform Plan",
      ".\\lab.ps1 plan -Profile <profile> -PresenterCidr <verified-ip/32>",
      "AVAILABLE",
    ],
    ["Review", ".\\lab.ps1 review", "AVAILABLE"],
    ["Deploy", "terraform apply <reviewed-plan>", "APPROVAL REQUIRED"],
    ["Bootstrap", "EC2 user data + SSM readiness", "NOT_DEPLOYED"],
    ["Verify", "verify-cost-minimal.ps1 -Profile <profile>", "NOT_DEPLOYED"],
    [
      "Run AWS benchmarks",
      "benchmark.ps1 against freshly verified endpoints",
      "NOT_DEPLOYED",
    ],
    [
      "Review Cleanup",
      ".\\lab.ps1 cleanup-preview -Profile <profile>",
      "AVAILABLE",
    ],
    [
      "Destroy",
      "terraform destroy after separate approval",
      "APPROVAL REQUIRED",
    ],
    [
      "Verify Residuals",
      ".\\lab.ps1 cleanup-preview -Profile <profile>",
      "AVAILABLE",
    ],
  ];
  return (
    <section className="execution-flow">
      {steps.map(([step, operation, state], index) => (
        <article className="portal-card" key={step}>
          <span>{index + 1}</span>
          <div>
            <h2>{step}</h2>
            <p>
              {state === "AVAILABLE"
                ? "Connected to a fixed read-only/local lifecycle action in the interactive workspace."
                : state === "NOT_DEPLOYED"
                  ? "Unavailable until current deployment evidence exists."
                  : "Visible for lifecycle clarity; no mutation executor is enabled."}
            </p>
            <code>{operation}</code>
          </div>
          <Pill
            tone={
              state === "AVAILABLE"
                ? "ok"
                : state === "NOT_DEPLOYED"
                  ? "warn"
                  : "bad"
            }
          >
            {state}
          </Pill>
        </article>
      ))}
    </section>
  );
}

function Benchmarks() {
  const [evidence, setEvidence] = useState<HistoricalEvidence | null>(null),
    [error, setError] = useState("");
  const [selected, setSelected] = useState<Set<ScenarioKey>>(
    () => new Set(Object.keys(scenarioMeta) as ScenarioKey[]),
  );
  const [metric, setMetric] = useState<MetricKey>("p50"),
    [query, setQuery] = useState(1);
  const [agentToken, setAgentToken] = useState(""),
    [localState, setLocalState] = useState<
      "OFFLINE" | "READY" | "RUNNING" | "SUCCEEDED" | "FAILED"
    >("OFFLINE"),
    [localLog, setLocalLog] = useState("");
  useEffect(() => {
    fetch("/evidence/aws-real-benchmark-latest.json", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Evidence HTTP ${response.status}`);
        return parseHistoricalEvidence(await response.text());
      })
      .then((value) => {
        if (value.runId !== historicalRunId)
          throw new Error(
            "Historical evidence pointer does not match the retained verified run.",
          );
        setEvidence(value);
      })
      .catch((reason) =>
        setError(
          reason instanceof Error ? reason.message : "Evidence unavailable",
        ),
      );
  }, []);
  useEffect(() => {
    Promise.all([
      fetch("http://127.0.0.1:3001/health"),
      fetch("http://127.0.0.1:3001/session"),
    ])
      .then(async ([health, session]) => {
        if (!health.ok || !session.ok) throw new Error("Agent unavailable");
        setAgentToken((await session.json()).csrfToken);
        setLocalState("READY");
      })
      .catch(() => setLocalState("OFFLINE"));
  }, []);
  const summaries = useMemo(
    () => (evidence ? visibleSummaries(evidence, selected) : []),
    [evidence, selected],
  );
  const toggle = (key: ScenarioKey) =>
    setSelected((current) => {
      const next = new Set(current);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  const exportJson = () =>
    evidence &&
    download(
      `aws-real-${evidence.runId}.json`,
      JSON.stringify(evidence, null, 2),
      "application/json",
    );
  const exportCsv = () =>
    evidence &&
    download(`aws-real-${evidence.runId}.csv`, toCsv(evidence), "text/csv");
  const runAllLocal = async () => {
    try {
      setLocalState("RUNNING");
      setLocalLog(
        `[${new Date().toLocaleTimeString()}] Dispatching fixed allowlisted local benchmark…\n`,
      );
      const response = await fetch(
        "http://127.0.0.1:3001/actions/local.benchmark-all/runs",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-lab-csrf": agentToken,
          },
          body: JSON.stringify({
            confirmed: true,
            parameters: { environment: "LOCAL_EMULATION", scenario: "CASE_1" },
          }),
        },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.message ?? `HTTP ${response.status}`);
      const source = new EventSource(`http://127.0.0.1:3001${body.eventsUrl}`);
      source.onmessage = (event) => {
        const item = JSON.parse(event.data);
        setLocalLog(
          (current) =>
            `${current}[${new Date(item.at).toLocaleTimeString()}] ${String(item.type).toUpperCase()}${item.data ? `\n${item.data}` : ""}\n`,
        );
        if (item.type === "finished") {
          source.close();
          fetch(`http://127.0.0.1:3001/runs/${body.runId}`)
            .then((value) => value.json())
            .then((run) =>
              setLocalState(run.state === "SUCCEEDED" ? "SUCCEEDED" : "FAILED"),
            )
            .catch(() => setLocalState("FAILED"));
        }
      };
      source.onerror = () => {
        source.close();
        setLocalState("FAILED");
      };
    } catch (reason) {
      setLocalState("FAILED");
      setLocalLog(
        (current) =>
          `${current}FAILED: ${reason instanceof Error ? reason.message : "Unknown error"}`,
      );
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="BENCHMARK CONSOLE"
        title="Compare evidence without hiding the provenance."
        copy="The retained run contains 60 excluded warm-ups and 1,200 measured HTTP requests. Scenario filters rescale the chart so Hybrid does not flatten the Singapore/Hanoi comparison."
        aside={
          <Pill tone={evidence ? "warn" : "bad"}>
            {evidenceState(false, evidence)}
          </Pill>
        }
      />
      <section className="portal-callout">
        <AlertTriangle />
        <div>
          <strong>Live AWS benchmark disabled: NOT_DEPLOYED</strong>
          <p>
            No current AWS endpoints exist. Local emulation can run all three
            scenarios sequentially; its evidence remains separate from
            historical AWS_REAL.
          </p>
        </div>
        <div className="button-row">
          <button
            disabled={localState === "OFFLINE" || localState === "RUNNING"}
            title={
              localState === "OFFLINE"
                ? "Start local mode with .\\lab.ps1 local"
                : "Runs 12 local groups sequentially"
            }
            onClick={() => void runAllLocal()}
          >
            <Play />
            Run All Three Locally
          </button>
          <a className="portal-button" href="/setup">
            Setup help
          </a>
        </div>
      </section>
      <section className="portal-card local-run-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">BEHIND THE ACTION · LOCAL_EMULATION</p>
            <h2>All-scenario local benchmark</h2>
          </div>
          <Pill
            tone={
              localState === "SUCCEEDED"
                ? "ok"
                : localState === "FAILED" || localState === "OFFLINE"
                  ? "bad"
                  : localState === "RUNNING"
                    ? "warn"
                    : "blue"
            }
          >
            {localState}
          </Pill>
        </div>
        <dl className="technical-facts">
          <div>
            <dt>Prerequisites</dt>
            <dd>
              Docker emulation healthy and trusted loopback agent on port 3001.
            </dd>
          </div>
          <div>
            <dt>Actual command</dt>
            <dd>
              <code>
                PowerShell scripts/emulation/verify-scenarios.ps1 -Scenario All
                -Samples 100 -Warmups 5
              </code>
            </dd>
          </div>
          <div>
            <dt>Mutation / cost</dt>
            <dd>
              Read-only SQL; writes local evidence files only. No AWS resource
              operation.
            </dd>
          </div>
          <div>
            <dt>Expected result</dt>
            <dd>
              12 groups: Cases 1–3 × 1/5/10/20 sequential queries; 5 excluded
              warm-ups and 100 measured requests per group.
            </dd>
          </div>
        </dl>
        {localLog ? (
          <pre className="local-run-log" aria-live="polite">
            {localLog}
          </pre>
        ) : null}
      </section>
      {error ? (
        <section className="portal-card error-state">
          <CircleOff />
          <h2>Historical evidence unavailable</h2>
          <p>{error}</p>
          <code>Expected /evidence/aws-real-benchmark-latest.json</code>
        </section>
      ) : !evidence ? (
        <section className="portal-card loading-state">
          <Activity />
          <p>Loading retained evidence…</p>
        </section>
      ) : (
        <>
          <section className="portal-card benchmark-toolbar">
            <div>
              <span>Visible scenarios</span>
              {(Object.keys(scenarioMeta) as ScenarioKey[]).map((key) => (
                <label
                  key={key}
                  style={
                    {
                      "--scenario-color": scenarioMeta[key].color,
                    } as React.CSSProperties
                  }
                >
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => toggle(key)}
                  />
                  <i />
                  {scenarioMeta[key].short}
                </label>
              ))}
            </div>
            <label>
              Metric
              <select
                value={metric}
                onChange={(event) => setMetric(event.target.value as MetricKey)}
              >
                {[
                  "p50",
                  "p95",
                  "p99",
                  "mean",
                  "min",
                  "max",
                  "standardDeviation",
                ].map((value) => (
                  <option key={value} value={value}>
                    {value === "standardDeviation"
                      ? "standard deviation"
                      : value}
                  </option>
                ))}
              </select>
            </label>
            <div className="button-row">
              <button onClick={exportJson}>
                <Download />
                JSON
              </button>
              <button onClick={exportCsv}>
                <Download />
                CSV
              </button>
            </div>
          </section>
          <section className="portal-card evidence-meta">
            <div>
              <span>Run ID</span>
              <strong>{evidence.runId}</strong>
            </div>
            <div>
              <span>Recorded</span>
              <strong>{new Date(evidence.completedAt).toLocaleString()}</strong>
            </div>
            <div>
              <span>Origin</span>
              <strong>{evidence.configuration.origin}</strong>
            </div>
            <div>
              <span>Workload</span>
              <strong>5 warm-ups · 100 measured · sequential</strong>
            </div>
          </section>
          <section className="portal-card benchmark-chart-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">HTTP {metric.toUpperCase()}</p>
                <h2>Sequential query amplification</h2>
              </div>
              <Pill tone="warn">HISTORICAL AWS_REAL</Pill>
            </div>
            <LineChart summaries={summaries} metric={metric} />
          </section>
          <section className="portal-card benchmark-table">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Scenario</th>
                    <th>SQL</th>
                    <th>Count</th>
                    <th>Errors</th>
                    <th>Mean</th>
                    <th>p50</th>
                    <th>p95</th>
                    <th>p99</th>
                    <th>Std dev</th>
                  </tr>
                </thead>
                <tbody>
                  {summaries.map((row) => (
                    <tr key={`${row.scenario}-${row.queryCount}`}>
                      <td>
                        <span
                          className="scenario-dot"
                          style={{
                            background: scenarioMeta[row.scenario].color,
                          }}
                        />
                        {scenarioMeta[row.scenario].short}
                      </td>
                      <td>{row.queryCount}</td>
                      <td>{row.metrics.count}</td>
                      <td>
                        {row.metrics.errors} ({row.metrics.errorRate.toFixed(1)}
                        %)
                      </td>
                      <td>{row.metrics.mean.toFixed(2)} ms</td>
                      <td>{row.metrics.p50.toFixed(2)} ms</td>
                      <td>{row.metrics.p95.toFixed(2)} ms</td>
                      <td>{row.metrics.p99.toFixed(2)} ms</td>
                      <td>{row.metrics.standardDeviation.toFixed(2)} ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="portal-card timeline">
            <div className="section-heading">
              <div>
                <p className="eyebrow">RAW SAMPLE TIMELINE</p>
                <h2>First 40 measured requests</h2>
              </div>
              <label>
                SQL queries
                <select
                  value={query}
                  onChange={(event) => setQuery(Number(event.target.value))}
                >
                  {evidence.configuration.queryCounts.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
              </label>
            </div>
            <RawTimeline
              samples={evidence.rawSamples
                .filter(
                  (item) =>
                    selected.has(item.scenario) && item.queryCount === query,
                )
                .slice(0, 40)}
            />
            <p className="method-note">
              Endpoint/origin and timestamps come from raw evidence. Instance
              type, client ISP, routing, TLS state, load and cache conditions
              affect comparison fairness. HTTP latency variation is not measured
              packet jitter.
            </p>
          </section>
        </>
      )}
    </>
  );
}

function LineChart({
  summaries,
  metric,
}: {
  summaries: Summary[];
  metric: MetricKey;
}) {
  const width = 900,
    height = 320,
    pad = 48,
    max = Math.max(1, ...summaries.map((item) => item.metrics[metric]));
  const x = (query: number) =>
    pad + ([1, 5, 10, 20].indexOf(query) / 3) * (width - pad * 2);
  const y = (value: number) =>
    height - pad - (value / max) * (height - pad * 2);
  if (!summaries.length)
    return <div className="chart-empty">Select at least one scenario.</div>;
  return (
    <div className="svg-chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${metric} HTTP latency by sequential SQL query count`}
      >
        <g className="grid-lines">
          {[0, 0.25, 0.5, 0.75, 1].map((value) => (
            <g key={value}>
              <line
                x1={pad}
                x2={width - pad}
                y1={y(max * value)}
                y2={y(max * value)}
              />
              <text x={pad - 8} y={y(max * value) + 4}>
                {(max * value).toFixed(0)}
              </text>
            </g>
          ))}
        </g>
        {(Object.keys(scenarioMeta) as ScenarioKey[]).map((key) => {
          const points = summaries
            .filter((item) => item.scenario === key)
            .map((item) => `${x(item.queryCount)},${y(item.metrics[metric])}`)
            .join(" ");
          return points ? (
            <g key={key}>
              <polyline
                points={points}
                fill="none"
                stroke={scenarioMeta[key].color}
                strokeWidth="4"
                strokeLinejoin="round"
              />
              {summaries
                .filter((item) => item.scenario === key)
                .map((item) => (
                  <circle
                    key={item.queryCount}
                    cx={x(item.queryCount)}
                    cy={y(item.metrics[metric])}
                    r="5"
                    fill={scenarioMeta[key].color}
                  >
                    <title>
                      {scenarioMeta[key].short} · {item.queryCount} SQL ·{" "}
                      {item.metrics[metric].toFixed(2)} ms
                    </title>
                  </circle>
                ))}
            </g>
          ) : null;
        })}
        {[1, 5, 10, 20].map((value) => (
          <text className="x-label" key={value} x={x(value)} y={height - 12}>
            {value} SQL
          </text>
        ))}
      </svg>
      <div className="chart-legend">
        {(Object.keys(scenarioMeta) as ScenarioKey[])
          .filter((key) => summaries.some((item) => item.scenario === key))
          .map((key) => (
            <span key={key}>
              <i style={{ background: scenarioMeta[key].color }} />
              {scenarioMeta[key].short}
            </span>
          ))}
      </div>
    </div>
  );
}
function RawTimeline({ samples }: { samples: RawSample[] }) {
  const max = Math.max(1, ...samples.map((item) => item.clientElapsedMs));
  return (
    <div
      className="raw-timeline"
      role="img"
      aria-label="Raw HTTP sample timeline"
    >
      {samples.map((item) => (
        <span
          key={`${item.scenario}-${item.queryCount}-${item.sample}`}
          style={{
            height: `${Math.max(4, (item.clientElapsedMs / max) * 100)}%`,
            background: scenarioMeta[item.scenario].color,
          }}
        >
          <i>
            {scenarioMeta[item.scenario].short} #{item.sample}:{" "}
            {item.clientElapsedMs.toFixed(2)} ms · DB{" "}
            {item.serverDbMs?.toFixed(2) ?? "n/a"} ms · HTTP {item.status}
          </i>
        </span>
      ))}
    </div>
  );
}
function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}
function toCsv(evidence: HistoricalEvidence) {
  const header =
    "scenario,query_count,count,errors,error_rate,mean_ms,p50_ms,p95_ms,p99_ms,std_dev_ms";
  return [
    header,
    ...evidence.summaries.map((item) =>
      [
        item.scenario,
        item.queryCount,
        item.metrics.count,
        item.metrics.errors,
        item.metrics.errorRate,
        item.metrics.mean,
        item.metrics.p50,
        item.metrics.p95,
        item.metrics.p99,
        item.metrics.standardDeviation,
      ].join(","),
    ),
  ].join("\n");
}

function Operations() {
  const [runs, setRuns] = useState<
      Array<{
        id: string;
        actionLabel: string;
        state: string;
        startedAt: string;
        durationMs?: number;
        exitCode?: number | null;
        evidence?: string;
        validation?: string;
      }>
    >([]),
    [agentOnline, setAgentOnline] = useState(false);
  useEffect(() => {
    fetch("http://127.0.0.1:3001/runs")
      .then(async (response) => {
        if (!response.ok) throw new Error();
        setRuns((await response.json()).runs);
        setAgentOnline(true);
      })
      .catch(() => setAgentOnline(false));
  }, []);
  const actions = [
    {
      name: "AWS identity preflight",
      operation:
        "PowerShell scripts/preflight/aws-readonly.ps1 -Profile <profile>",
      target: "AWS · ap-southeast-1",
      risk: "READ_ONLY",
      outcome:
        "Redacted STS identity, Hanoi zone opt-in and offered instance types.",
    },
    {
      name: "Terraform review plan",
      operation:
        "PowerShell .\\lab.ps1 plan -Profile <configured-profile> -PresenterCidr <verified-ipv4/32>",
      target: "AWS read-only data sources + local saved plan",
      risk: "READ_ONLY",
      outcome:
        "Account-gated clone-review.tfplan; no apply operation is dispatched.",
    },
    {
      name: "Saved plan review",
      operation: "PowerShell .\\lab.ps1 review",
      target: "Local clone-review.tfplan",
      risk: "READ_ONLY",
      outcome: "Exact Terraform plan rendered with streamed sanitized logs.",
    },
    {
      name: "Cleanup / residual preview",
      operation:
        "PowerShell .\\lab.ps1 cleanup-preview -Profile <configured-profile>",
      target: "Tagged AWS inventory",
      risk: "READ_ONLY",
      outcome:
        "Counts active EC2, EBS, Elastic IP and related secret state; deletes nothing.",
    },
    {
      name: "Local environment verification",
      operation:
        "HTTP GET /health and /api/topology for each selected local target",
      target: "LOCAL_EMULATION",
      risk: "READ_ONLY",
      outcome: "Database-connected health and provenance match.",
    },
    {
      name: "Benchmark request",
      operation: "HTTP GET /api/benchmark/db?n=1|5|10|20",
      target: "Selected API endpoint",
      risk: "READ_ONLY",
      outcome: "Raw HTTP, application and sequential SQL timing samples.",
    },
    {
      name: "Synthetic order creation",
      operation: "HTTP POST /api/orders with generated DEMO reference",
      target: "Selected API endpoint",
      risk: "TEST_WRITE",
      outcome: "201 response and read-back; DELETE is not implemented.",
    },
  ];
  return (
    <>
      <PageTitle
        eyebrow="OPERATIONS"
        title="See what a button will actually do."
        copy="The localhost agent exposes a fixed allowlist and streams sanitized SSE events. API requests are described as API requests—never disguised as shell commands."
      />
      <section className="operation-grid">
        {actions.map((action) => (
          <details className="portal-card action-card" key={action.name}>
            <summary>
              <div>
                <Terminal />
                <span>
                  <strong>{action.name}</strong>
                  <small>{action.target}</small>
                </span>
              </div>
              <Pill tone={action.risk === "READ_ONLY" ? "ok" : "warn"}>
                {action.risk}
              </Pill>
            </summary>
            <div className="behind-action">
              <p className="eyebrow">BEHIND THE ACTION</p>
              <dl>
                <div>
                  <dt>Prerequisites</dt>
                  <dd>
                    Trusted localhost agent, valid selected environment and CSRF
                    session.
                  </dd>
                </div>
                <div>
                  <dt>Actual operation</dt>
                  <dd>
                    <code>{action.operation}</code>
                  </dd>
                </div>
                <div>
                  <dt>Billing / mutation</dt>
                  <dd>
                    {action.risk === "READ_ONLY"
                      ? "No resource mutation; normal API request charges may apply."
                      : "Creates one synthetic database record after explicit confirmation."}
                  </dd>
                </div>
                <div>
                  <dt>Expected outcome</dt>
                  <dd>{action.outcome}</dd>
                </div>
                <div>
                  <dt>During / after</dt>
                  <dd>
                    Timestamped SSE stdout/stderr, status, duration, exit/HTTP
                    code, validation and evidence path.
                  </dd>
                </div>
              </dl>
            </div>
          </details>
        ))}
      </section>
      <section className="portal-card operation-history">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CURRENT AGENT SESSION</p>
            <h2>Execution history</h2>
          </div>
          <Pill tone={agentOnline ? "ok" : "bad"}>
            {agentOnline ? "AGENT READY" : "AGENT OFFLINE"}
          </Pill>
        </div>
        {runs.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Started</th>
                  <th>Action</th>
                  <th>Status</th>
                  <th>Duration</th>
                  <th>Exit / HTTP</th>
                  <th>Evidence or validation</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id}>
                    <td>{new Date(run.startedAt).toLocaleTimeString()}</td>
                    <td>{run.actionLabel}</td>
                    <td>{run.state}</td>
                    <td>
                      {run.durationMs == null
                        ? "running"
                        : `${run.durationMs} ms`}
                    </td>
                    <td>{run.exitCode ?? "—"}</td>
                    <td>{run.evidence ?? run.validation ?? "Pending"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>
            {agentOnline
              ? "No actions have run since this agent started."
              : "Start local mode to inspect new execution history."}
          </p>
        )}
      </section>
      <section className="portal-callout">
        <ShieldCheck />
        <div>
          <strong>Browser shell is intentionally unavailable</strong>
          <p>
            Retry is limited to safe fixed actions. Apply, destroy, EC2
            lifecycle, migration, snapshot and restore executors are not enabled
            by this task.
          </p>
        </div>
        <a className="portal-button" href="/demo#terminal">
          Open interactive workspace <ExternalLink />
        </a>
      </section>
    </>
  );
}
