import { StrictMode, useEffect, useRef, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  Box,
  CheckCircle2,
  ChevronDown,
  CirclePause,
  CirclePlay,
  CircleStop,
  Clipboard,
  Cloud,
  Database,
  Download,
  ExternalLink,
  FileClock,
  Globe2,
  Network,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  ShieldCheck,
  SkipForward,
  Terminal,
  XCircle,
} from "lucide-react";
import {
  environmentSupportsScenario,
  lifecycleControls,
  scenarios,
  type EnvironmentId,
  type Risk,
  type ScenarioId,
  type Step,
} from "./workflow";
import { Portal } from "./portal";
import "./styles.css";

const agentBase = "http://127.0.0.1:3001";
type Target = {
  environment: EnvironmentId;
  scenario: ScenarioId;
  baseUrl: string;
  available: boolean;
  reason?: string;
  provenance: string;
  frontendLocation: string;
  apiLocation: string;
  databaseLocation: string;
  networkPath: string;
};
type Catalog = {
  generatedAt: string;
  targets: Target[];
  unavailableWorkflows: Array<{ id: string; status: string; reason: string }>;
};
type LifecyclePlan = {
  fresh: boolean;
  reasons: string[];
  accountSuffix?: string;
  planHashPrefix?: string;
  manifest: null | {
    operation: "APPLY" | "DESTROY";
    generatedAt: string;
    deploymentIdentity: string;
    region: string;
    planPath: string;
    planSha256: string;
    changes: { create: number; update: number; delete: number; addresses: Array<{ address: string; actions: string[] }> };
    exactCommand: string;
    expectedEffects: string;
  };
};
type LifecycleState = { mutationExecutionEnabled:boolean; locked:boolean; apply:LifecyclePlan; destroy:LifecyclePlan };
type Action = {
  id: string;
  label: string;
  description: string;
  scenarios: ScenarioId[];
  environments: EnvironmentId[];
  risk: Risk;
  preview: string;
  retry: string;
  idempotency: string;
  safeAutomatic: boolean;
  cancellable: boolean;
};
type RunEvent = {
  type: string;
  at: string;
  data?: string;
  exitCode?: number | null;
};
type RunState = "RUNNING" | "SUCCEEDED" | "FAILED" | "BLOCKED" | "CANCELLED";
type Run = {
  id: string;
  actionId: string;
  actionLabel: string;
  state: RunState;
  risk: Risk;
  parameters: Record<string, unknown>;
  events: RunEvent[];
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  exitCode?: number | null;
  evidence?: string;
  validation?: string;
};
type Sample = {
  index: number;
  clientElapsedMs: number;
  serverDbMs?: number;
  ok: boolean;
};
type BenchmarkEvidence = {
  mode: string;
  scenario: string;
  queryCount: number;
  metrics: {
    count: number;
    errors: number;
    errorRate: number;
    p50: number | null;
    p95: number | null;
    p99: number | null;
    mean: number | null;
    min: number | null;
    max: number | null;
    standardDeviation: number | null;
  };
  rawSamples: Sample[];
  source: "LIVE" | "PREVIOUSLY_VERIFIED";
  recordedAt?: string;
};
type PreflightCheck = {
  id: string;
  label: string;
  status: "READY" | "NOT_READY";
  detail: string;
};
type PreflightEvidence = {
  generatedAt: string;
  status: string;
  localDemoState: "READY" | "NOT_READY";
  awsRealState: "READY" | "NOT_READY";
  checks: PreflightCheck[];
  presenter?: {
    currentIpv4?: string;
    plannedCidrs?: string[];
    matchesPlan?: boolean;
  };
  aws?: { profile?: string; region?: string; authenticated?: boolean };
  safeguards?: string[];
};
type EvidenceCard = { title: string; path: string; detail: string };
type SequenceItem = {
  actionId: string;
  label: string;
  state:
    | "PENDING"
    | "RUNNING"
    | "SUCCEEDED"
    | "FAILED"
    | "CANCELLED"
    | "SKIPPED";
};

const environmentLabels: Record<EnvironmentId, string> = {
  LOCAL_EMULATION: "Local emulation",
  AWS_REAL_SINGAPORE: "AWS real · Singapore",
  AWS_REAL_HANOI: "AWS real · Hanoi",
  AWS_REAL_HYBRID: "AWS real · Hybrid",
  EXTERNAL_VN_REAL: "External Vietnam real",
};
const riskLabel: Record<Risk, string> = {
  READ_ONLY: "Read only",
  TEST_WRITE: "Synthetic write",
  BILLABLE: "Billable",
  DESTRUCTIVE: "Destructive",
};
const fmt = (value: number | null | undefined) =>
  value == null ? "—" : `${value.toFixed(2)} ms`;

function Status({
  kind = "idle",
  children,
}: {
  kind?: "idle" | "ok" | "warn" | "bad";
  children: ReactNode;
}) {
  return (
    <span className={`badge ${kind}`}>
      <span aria-hidden="true" />
      {children}
    </span>
  );
}
function IconBox({ children }: { children: ReactNode }) {
  return (
    <span className="icon-box" aria-hidden="true">
      {children}
    </span>
  );
}
function Notice({
  children,
  kind = "warn",
}: {
  children: ReactNode;
  kind?: "warn" | "bad";
}) {
  return (
    <div className={`notice ${kind}`} role={kind === "bad" ? "alert" : "note"}>
      <AlertTriangle aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}

function useAgent() {
  const [online, setOnline] = useState(false),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [actions, setActions] = useState<Action[]>([]),
    [lifecycle, setLifecycle] = useState<LifecycleState | null>(null),
    [token, setToken] = useState(""),
    [error, setError] = useState("");
  const refresh = async () => {
    try {
      const [health, environments, actionResponse, session, lifecycleResponse] = await Promise.all(
        [
          fetch(`${agentBase}/health`),
          fetch(`${agentBase}/environments`),
          fetch(`${agentBase}/actions`),
          fetch(`${agentBase}/session`),
          fetch(`${agentBase}/lifecycle`),
        ],
      );
      if (!health.ok || !environments.ok || !actionResponse.ok || !session.ok || !lifecycleResponse.ok)
        throw new Error("Agent returned an unsuccessful status.");
      setCatalog(await environments.json());
      setActions((await actionResponse.json()).actions);
      setToken((await session.json()).csrfToken);
      setLifecycle(await lifecycleResponse.json());
      setOnline(true);
      setError("");
    } catch (cause) {
      setOnline(false);
      setError(cause instanceof Error ? cause.message : "Agent unavailable");
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return { online, catalog, actions, lifecycle, token, error, refresh };
}

function parseBenchmark(
  value: any,
  source: "LIVE" | "PREVIOUSLY_VERIFIED",
): BenchmarkEvidence[] {
  if (Array.isArray(value?.summaries))
    return value.summaries.map((item: any) => ({
      mode: value.mode ?? "LOCAL_NETWORK_EMULATION",
      scenario: item.scenario,
      queryCount: item.queryCount,
      metrics: item.metrics,
      rawSamples: [],
      source,
      recordedAt: value.generatedAt,
    }));
  if (value?.metrics)
    return [{ ...value, source, rawSamples: value.rawSamples ?? [] }];
  return [];
}
function parseAwsBenchmarks(value: any): Record<string, BenchmarkEvidence[]> {
  const environments: Record<string, string> = {
    AWS_REAL_SINGAPORE: "AWS_REAL_SINGAPORE",
    AWS_REAL_HANOI: "AWS_REAL_HANOI",
    AWS_REAL_HYBRID: "AWS_REAL_HYBRID",
  };
  const result: Record<string, BenchmarkEvidence[]> = {};
  for (const summary of value?.summaries ?? []) {
    const environment = environments[summary.scenario];
    if (!environment) continue;
    const rawSamples = (value.rawSamples ?? [])
      .filter(
        (sample: any) =>
          sample.scenario === summary.scenario &&
          sample.queryCount === summary.queryCount,
      )
      .map((sample: any) => ({
        ...sample,
        index: sample.index ?? sample.sample,
      }));
    (result[environment] ??= []).push({
      mode: "AWS_REAL",
      scenario: summary.scenario,
      queryCount: summary.queryCount,
      metrics: summary.metrics,
      rawSamples,
      source: "PREVIOUSLY_VERIFIED",
      recordedAt: value.completedAt,
    });
  }
  return result;
}
function normalizePreflight(value: any): PreflightEvidence {
  return {
    generatedAt:
      value.generatedAt ?? value.checkedAt ?? new Date().toISOString(),
    status: value.status ?? "SUCCEEDED",
    localDemoState: value.localDemoState ?? "NOT_READY",
    awsRealState: value.awsRealState ?? "NOT_READY",
    checks: (value.checks ?? []).map((item: any, index: number) => ({
      id: item.id ?? `check-${index}`,
      label: item.label ?? item.name ?? "Check",
      status: item.status ?? item.state ?? "NOT_READY",
      detail: item.detail ?? "",
    })),
    presenter: {
      currentIpv4:
        value.presenter?.currentIpv4 ?? value.presenterCidr?.replace("/32", ""),
      plannedCidrs: value.presenter?.plannedCidrs ?? value.plannedCidrs ?? [],
      matchesPlan:
        value.presenter?.matchesPlan ??
        Boolean(
          value.presenterCidr &&
            (value.plannedCidrs ?? []).includes(value.presenterCidr),
        ),
    },
    aws: {
      profile: value.aws?.profile ?? value.profile,
      region: value.aws?.region ?? value.region,
      authenticated:
        value.aws?.authenticated ?? value.authentication === "AUTHENTICATED",
    },
    safeguards: value.safeguards ?? [],
  };
}

function App() {
  const agent = useAgent();
  const [environment, setEnvironment] = useState<EnvironmentId>(
    () =>
      (localStorage.getItem("hanoi-lab.environment") as EnvironmentId) ||
      "LOCAL_EMULATION",
  );
  const [scenarioId, setScenarioId] = useState<ScenarioId>("CASE_1"),
    [advanced, setAdvanced] = useState(false);
  const [run, setRun] = useState<Run | null>(null),
    [log, setLog] = useState("No action has run in this console session."),
    [benchmarks, setBenchmarks] = useState<Record<string, BenchmarkEvidence[]>>(
      {},
    ),
    [preflight, setPreflight] = useState<PreflightEvidence | null>(null);
  const [previous, setPrevious] = useState<EvidenceCard[]>([]),
    [recovery, setRecovery] = useState(false),
    [sequence, setSequence] = useState<SequenceItem[]>([]),
    [sequenceState, setSequenceState] = useState<
      "IDLE" | "RUNNING" | "PAUSED" | "SUCCEEDED" | "FAILED" | "CANCELLED"
    >("IDLE"),
    [lastRequest, setLastRequest] = useState<{
      actionId: string;
      step: Step;
      extra?: Record<string, unknown>;
    } | null>(null);
  const pauseRef = useRef(false),
    skipRef = useRef(false),
    runningRef = useRef<Run | null>(null);
  const scenario = scenarios.find((item) => item.id === scenarioId)!;
  const target = agent.catalog?.targets.find(
    (item) => item.environment === environment && item.scenario === scenarioId,
  );
  const environmentAvailable =
      environment === "LOCAL_EMULATION"
        ? agent.online
        : Boolean(target?.available),
    compatibility = environmentSupportsScenario(environment, scenarioId);
  const currentRunCancellable = Boolean(
    run && agent.actions.find((item) => item.id === run.actionId)?.cancellable,
  );

  useEffect(() => {
    localStorage.setItem("hanoi-lab.environment", environment);
    setRun(null);
    setLog(
      `Environment selected: ${environmentLabels[environment]}. No infrastructure action was performed.`,
    );
  }, [environment]);
  useEffect(() => {
    void Promise.all([
      fetch("/evidence/benchmark-latest.json")
        .then(async (response) => (response.ok ? response.json() : null))
        .then((value) => {
          if (value)
            setBenchmarks((current) => ({
              ...current,
              LOCAL_EMULATION: parseBenchmark(value, "PREVIOUSLY_VERIFIED"),
            }));
        })
        .catch(() => undefined),
      fetch("/evidence/aws-real-benchmark-latest.json")
        .then(async (response) => (response.ok ? response.json() : null))
        .then((value) => {
          if (value)
            setBenchmarks((current) => ({
              ...current,
              ...parseAwsBenchmarks(value),
            }));
        })
        .catch(() => undefined),
      fetch("/evidence/local-emulation-migration.json")
        .then((response) => (response.ok ? response.json() : null))
        .then((value) => {
          if (value)
            setPrevious((current) => [
              ...current,
              {
                title: "Case 4 migration verification",
                path: "/evidence/local-emulation-migration.json",
                detail: `Verified ${value.generatedAt ?? value.completedAt ?? "previous rehearsal"} · row counts/checksums inspectable`,
              },
            ]);
        })
        .catch(() => undefined),
      fetch("/evidence/local-emulation-backup-restore.json")
        .then((response) => (response.ok ? response.json() : null))
        .then((value) => {
          if (value)
            setPrevious((current) => [
              ...current,
              {
                title: "Case 5 logical recovery verification",
                path: "/evidence/local-emulation-backup-restore.json",
                detail: `Verified ${value.generatedAt ?? value.completedAt ?? "previous rehearsal"} · isolated restore evidence`,
              },
            ]);
        })
        .catch(() => undefined),
    ]);
  }, []);

  async function execute(
    actionId: string,
    step: Step,
    extra: Record<string, unknown> = {},
    automatic = false,
  ): Promise<Run> {
    const action = agent.actions.find((item) => item.id === actionId);
    if (!action || !agent.token)
      throw new Error("Action unavailable or trusted agent session missing.");
    if (automatic && (!action.safeAutomatic || action.risk !== "READ_ONLY"))
      throw new Error(
        `${action.id} is not in the safe automatic read-only allowlist.`,
      );
    const confirmed =
      automatic ||
      action.risk === "READ_ONLY" ||
      window.confirm(
        `${action.label}\n\nRisk: ${riskLabel[action.risk]}\n${action.description}\n\nContinue?`,
      );
    if (!confirmed) throw new Error("Operation cancelled before dispatch.");
    setLastRequest({ actionId, step, extra });
    setLog("Dispatching fixed allowlisted action to the localhost agent…");
    setRun(null);
    const parameters = { environment, scenario: scenarioId, ...extra };
    const response = await fetch(`${agentBase}/actions/${action.id}/runs`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-lab-csrf": agent.token,
      },
      body: JSON.stringify({ confirmed, parameters }),
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.message ?? body.error ?? `HTTP ${response.status}`);
    const active: Run = {
      id: body.runId,
      actionId: action.id,
      actionLabel: action.label,
      state: "RUNNING",
      risk: action.risk,
      parameters,
      events: [],
      startedAt: new Date().toISOString(),
    };
    runningRef.current = active;
    setRun(active);
    return await new Promise<Run>((resolve, reject) => {
      const source = new EventSource(`${agentBase}${body.eventsUrl}`);
      let output = "";
      let finished = false;
      source.onmessage = async (event) => {
        const item = JSON.parse(event.data) as RunEvent;
        output += `[${new Date(item.at).toLocaleTimeString()}] ${item.type.toUpperCase()}${item.exitCode !== undefined ? ` exit=${item.exitCode}` : ""}${item.data ? `\n${item.data}` : ""}\n`;
        setLog(output);
        if (item.type === "finished") {
          finished = true;
          source.close();
          try {
            const result = (await fetch(`${agentBase}/runs/${body.runId}`).then(
              (value) => value.json(),
            )) as Run;
            runningRef.current = null;
            setRun(result);
            if (result.evidence) {
              const evidenceResponse = await fetch(`/${result.evidence}`);
              if (evidenceResponse.ok) {
                const evidence = await evidenceResponse.json();
                if (action.id === "benchmark.run")
                  setBenchmarks((current) => ({
                    ...current,
                    [environment]: [
                      ...parseBenchmark(evidence, "LIVE"),
                      ...(current[environment] ?? []),
                    ],
                  }));
                if (action.id === "demo.preflight")
                  setPreflight(normalizePreflight(evidence));
              }
            }
            if (result.state === "SUCCEEDED") {
              if (action.id.startsWith("aws.")) await agent.refresh();
              resolve(result);
            }
            else
              reject(
                new Error(
                  `${action.label} ended ${result.state}. ${result.validation ?? ""}`,
                ),
              );
          } catch (cause) {
            reject(cause);
          }
        }
      };
      source.onerror = () => {
        source.close();
        if (!finished) {
          setLog(
            (value) =>
              `${value}\nSSE connection closed unexpectedly; success was not inferred.`,
          );
          setRecovery(true);
          reject(
            new Error(
              "Execution stream closed before a terminal run record was received.",
            ),
          );
        }
      };
    });
  }
  async function runStep(
    actionId: string,
    step: Step,
    extra: Record<string, unknown> = {},
    automatic = false,
  ) {
    try {
      return await execute(actionId, step, extra, automatic);
    } catch (cause) {
      setLog(
        (value) =>
          `${value}\nFAILED\n${cause instanceof Error ? cause.message : "Unknown error"}`,
      );
      setRecovery(true);
      throw cause;
    }
  }
  async function cancel() {
    const active = runningRef.current ?? run;
    if (!active || active.state !== "RUNNING") return;
    if (
      !agent.actions.find((item) => item.id === active.actionId)?.cancellable
    ) {
      setLog(
        (value) =>
          `${value}\nCancellation is not safe for this in-flight HTTP operation; wait for its terminal state.`,
      );
      return;
    }
    const response = await fetch(`${agentBase}/runs/${active.id}/cancel`, {
      method: "POST",
      headers: { "x-lab-csrf": agent.token },
    });
    if (!response.ok) {
      setLog(
        (value) =>
          `${value}\nCancel request was rejected with HTTP ${response.status}; no cancellation is claimed.`,
      );
      return;
    }
    if (sequenceState === "RUNNING" || sequenceState === "PAUSED")
      setSequenceState("CANCELLED");
    setRecovery(true);
  }
  async function retryLast() {
    if (!lastRequest) return;
    setRecovery(false);
    try {
      await runStep(lastRequest.actionId, lastRequest.step, lastRequest.extra);
    } catch {
      /* recovery panel remains */
    }
  }
  async function runSafeSequence() {
    const ids =
      scenarioId === "CASE_4" || scenarioId === "CASE_5"
        ? ["demo.preflight", "local.preflight"]
        : [
            "demo.preflight",
            "environment.verify",
            "application.health",
            "topology.inspect",
            "orders.list",
            "benchmark.run",
          ];
    const queue = ids
      .map((id) => agent.actions.find((item) => item.id === id))
      .filter((item): item is Action =>
        Boolean(
          item &&
            item.safeAutomatic &&
            item.risk === "READ_ONLY" &&
            item.environments.includes(environment) &&
            item.scenarios.includes(scenarioId),
        ),
      )
      .map((item) => ({
        actionId: item.id,
        label: item.label,
        state: "PENDING" as const,
      }));
    if (!queue.length) {
      setRecovery(true);
      setLog(
        "No safe automatic actions are available for this environment and scenario.",
      );
      return;
    }
    setSequence(queue);
    setSequenceState("RUNNING");
    pauseRef.current = false;
    skipRef.current = false;
    for (let index = 0; index < queue.length; index++) {
      while (pauseRef.current) {
        setSequenceState("PAUSED");
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      setSequenceState("RUNNING");
      if (skipRef.current) {
        skipRef.current = false;
        setSequence((current) =>
          current.map((item, i) =>
            i === index ? { ...item, state: "SKIPPED" } : item,
          ),
        );
        continue;
      }
      const item = queue[index];
      setSequence((current) =>
        current.map((entry, i) =>
          i === index ? { ...entry, state: "RUNNING" } : entry,
        ),
      );
      try {
        await runStep(
          item.actionId,
          {
            id: `auto-${item.actionId}`,
            label: item.label,
            detail: "Safe automatic sequence",
            actionId: item.actionId,
            risk: "READ_ONLY",
          },
          item.actionId === "benchmark.run"
            ? { samples: 20, warmups: 5, queryCount: 1 }
            : {},
          true,
        );
        setSequence((current) =>
          current.map((entry, i) =>
            i === index ? { ...entry, state: "SUCCEEDED" } : entry,
          ),
        );
      } catch {
        setSequence((current) =>
          current.map((entry, i) =>
            i === index
              ? {
                  ...entry,
                  state:
                    runningRef.current?.state === "CANCELLED"
                      ? "CANCELLED"
                      : "FAILED",
                }
              : entry,
          ),
        );
        setSequenceState("FAILED");
        return;
      }
    }
    setSequenceState("SUCCEEDED");
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#lab-main">
        Skip to lab workspace
      </a>
      <header className="topbar">
        <div className="identity">
          <div className="mark">
            <Network aria-hidden="true" />
          </div>
          <div>
            <strong>HANOI LOCAL ZONE</strong>
            <span>Interactive lab workspace</span>
          </div>
        </div>
        <div className="top-status">
          <Status kind={agent.online ? "ok" : "bad"}>
            {agent.online ? "CONTROL AGENT READY" : "AGENT OFFLINE"}
          </Status>
          <button
            className="quiet"
            onClick={() => setAdvanced((value) => !value)}
            aria-pressed={advanced}
          >
            {advanced ? "Guided mode" : "Advanced inspection"}
          </button>
          <a href="/">Portal overview</a>
          <a href="http://localhost:8081" target="_blank" rel="noreferrer">
            Order app <ExternalLink aria-hidden="true" />
          </a>
        </div>
      </header>
      <WorkspaceNav />
      <main id="lab-main">
        <section className="hero talk-section">
          <div>
            <p className="eyebrow">
              INTERACTIVE LAB WORKSPACE · REAL OPERATIONS ONLY
            </p>
            <h1>Select a path. Inspect the action. Run real evidence.</h1>
            <p>
              Choose Singapore, Hanoi or Hybrid, follow the allowlisted
              workflow, and inspect the exact HTTP or command operation before
              execution. The cost-minimal architecture uses one Singapore EC2
              and one Hanoi EC2; Hybrid reuses the Singapore API.
            </p>
            <div className="hero-actions">
              <a className="button-link" href="#scenarios">
                <Play aria-hidden="true" />
                Explore scenarios
              </a>
              <a className="button-link" href="/benchmarks">
                <Globe2 aria-hidden="true" />
                Compare benchmarks
              </a>
              <button onClick={() => void agent.refresh()}>
                <RefreshCw aria-hidden="true" />
                Refresh discovery
              </button>
            </div>
          </div>
          <ArchitectureSummary />
        </section>
        {!agent.online ? (
          <Notice kind="bad">
            <strong>Trusted localhost agent is unavailable.</strong>
            <p>
              Start it with <code>npm run dev -w @hanoi-lab/agent</code>.
              Workflow controls remain disabled. {agent.error}
            </p>
          </Notice>
        ) : null}
        <section id="preflight" className="talk-section">
          <DemoPreflight
            evidence={preflight}
            online={agent.online}
            onRun={() =>
              void runStep("demo.preflight", {
                id: "demo-preflight",
                label: "Demo Preflight",
                detail: "Read-only presenter readiness diagnostics.",
                actionId: "demo.preflight",
                risk: "READ_ONLY",
              }).catch(() => undefined)
            }
          />
          <LifecyclePanelV2
            run={run}
            actions={agent.actions}
            online={agent.online}
            lifecycle={agent.lifecycle}
            catalog={agent.catalog}
            csrfToken={agent.token}
            onRefresh={()=>void agent.refresh()}
            onRun={(actionId, control, presenterCidr) =>
              void runStep(
                actionId,
                {
                  id: control.id,
                  label: control.label,
                  detail: control.detail,
                  actionId,
                  risk: control.risk,
                },
                {
                  environment: "AWS_REAL_SINGAPORE",
                  scenario: "CASE_1",
                  ...(presenterCidr ? { presenterCidr } : {}),
                },
              ).catch(() => undefined)
            }
          />
        </section>
        <section id="architecture" className="talk-section">
          <EnvironmentSelector
            environment={environment}
            onChange={setEnvironment}
            catalog={agent.catalog}
          />
          {!compatibility ? (
            <Notice>
              <strong>Scenario unavailable in this environment.</strong>
              <p>Switching modes never changes AWS infrastructure.</p>
            </Notice>
          ) : null}
          {compatibility && !environmentAvailable ? (
            <Notice>
              <strong>{target?.reason ?? "NOT_DEPLOYED / UNAVAILABLE"}</strong>
              <p>
                No endpoint, resource ID, or cloud measurement will be
                fabricated.
              </p>
            </Notice>
          ) : null}
          {environment === "LOCAL_EMULATION" ? (
            <Notice>
              <strong>
                Operator-defined illustrative latency — not AWS Hanoi Local Zone
                performance.
              </strong>
              <p>
                HTTP and PostgreSQL operations are genuine; geography and delay
                parameters are local emulation.
              </p>
            </Notice>
          ) : null}
          <ArchitectureMap
            target={target}
            scenarioId={scenarioId}
            environment={environment}
            running={run?.state === "RUNNING"}
          />
        </section>
        <section id="scenarios" className="talk-section">
          <ScenarioTabs
            selected={scenarioId}
            onChange={(value) => {
              setScenarioId(value);
              location.hash = `case-${value.slice(-1)}`;
            }}
          />
          <div className="workspace">
            <WorkflowPanel
              scenario={scenario}
              actions={agent.actions}
              environment={environment}
              online={agent.online}
              available={compatibility && environmentAvailable}
              onRun={(id, step, extra) =>
                void runStep(id, step, extra).catch(() => undefined)
              }
            />
            <SafeSequencePanel
              items={sequence}
              state={sequenceState}
              disabled={
                !agent.online || !compatibility || !environmentAvailable
              }
              canCancel={currentRunCancellable}
              onRun={() => void runSafeSequence()}
              onPause={() => {
                pauseRef.current = !pauseRef.current;
                setSequenceState(pauseRef.current ? "PAUSED" : "RUNNING");
              }}
              onSkip={() => {
                skipRef.current = true;
              }}
              onCancel={() => void cancel()}
            />
          </div>
        </section>
        <section id="terminal" className="talk-section">
          <ExecutionTerminal
            run={run}
            log={log}
            onCancel={cancel}
            onRetry={() => void retryLast()}
            canRetry={Boolean(lastRequest)}
            canCancel={currentRunCancellable}
          />
          {recovery ? (
            <RecoveryPanel
              onRefresh={() => void agent.refresh()}
              onRetry={() => void retryLast()}
              onClose={() => setRecovery(false)}
            />
          ) : null}
        </section>
        <section id="benchmarks" className="talk-section">
          <BenchmarkPanel
            environment={environment}
            evidence={benchmarks[environment] ?? []}
          />
          <PreviousEvidencePanel cards={previous} />
        </section>
        {advanced ? (
          <InspectionPanel catalog={agent.catalog} actions={agent.actions} />
        ) : null}
        <section id="conclusions" className="talk-section">
          <ConclusionPanel />
        </section>
      </main>
      <footer>
        <span>LOCALHOST CONTROL AGENT · FIXED ALLOWLIST</span>
        <span>Evidence first · credentials never enter the browser</span>
        <span>{new Date().toLocaleDateString()}</span>
      </footer>
    </div>
  );
}

function WorkspaceNav() {
  return (
    <nav className="workspace-rail" aria-label="Lab workspace sections">
      {[
        ["architecture", "Architecture"],
        ["preflight", "Readiness"],
        ["scenarios", "Scenario workflows"],
        ["terminal", "Operations"],
        ["benchmarks", "Metrics"],
        ["conclusions", "Findings"],
      ].map(([id, label]) => (
        <a key={id} href={`#${id}`}>
          {label}
        </a>
      ))}
    </nav>
  );
}
function ArchitectureSummary() {
  return (
    <aside
      className="architecture-summary"
      aria-label="Final intended AWS architecture"
    >
      <div>
        <Server aria-hidden="true" />
        <strong>Singapore EC2</strong>
        <span>API + PostgreSQL</span>
      </div>
      <div>
        <Network aria-hidden="true" />
        <strong>Hybrid path</strong>
        <span>Singapore API → Hanoi DB</span>
      </div>
      <div>
        <Database aria-hidden="true" />
        <strong>Hanoi EC2 + EBS</strong>
        <span>API + PostgreSQL</span>
      </div>
      <small>No third hybrid EC2 · cross-cloud DR remains theory only</small>
    </aside>
  );
}

function DemoPreflight({
  evidence,
  online,
  onRun,
}: {
  evidence: PreflightEvidence | null;
  online: boolean;
  onRun: () => void;
}) {
  const checks = evidence?.checks ?? [];
  return (
    <article className="panel preflight-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">READ-ONLY READINESS GATE</p>
          <h2>Workspace Preflight</h2>
        </div>
        <Status
          kind={
            !evidence
              ? "idle"
              : evidence.awsRealState === "READY" ||
                  evidence.localDemoState === "READY"
                ? "ok"
                : "bad"
          }
        >
          {!evidence
            ? "NOT RUN"
            : evidence.awsRealState === "READY"
              ? "AWS READY"
              : evidence.localDemoState === "READY"
                ? "LOCAL READY"
                : "NOT_READY"}
        </Status>
      </div>
      <p className="panel-copy">
        Checks AWS authentication, operator IPv4 allowlist, actual
        endpoint/database health, Compose services and tagged AWS placement. It
        performs no AWS mutation.
      </p>
      <div className="readiness-grid">
        <div>
          <span>Control agent</span>
          <strong>{online ? "READY" : "NOT_READY"}</strong>
        </div>
        <div>
          <span>Local demo</span>
          <strong>{evidence?.localDemoState ?? "NOT_CHECKED"}</strong>
        </div>
        <div>
          <span>AWS real</span>
          <strong>{evidence?.awsRealState ?? "NOT_CHECKED"}</strong>
        </div>
        <div>
          <span>Operator CIDR</span>
          <strong>
            {evidence?.presenter?.matchesPlan
              ? "READY"
              : "NOT_CHECKED / CHANGED"}
          </strong>
        </div>
      </div>
      {checks.length ? (
        <div className="check-grid">
          {checks.map((check) => (
            <div key={check.id}>
              <span
                className={
                  check.status === "READY" ? "state-icon ok" : "state-icon bad"
                }
              >
                {check.status === "READY" ? (
                  <CheckCircle2 aria-hidden="true" />
                ) : (
                  <XCircle aria-hidden="true" />
                )}
              </span>
              <div>
                <strong>{check.label}</strong>
                <small>{check.detail}</small>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      <div className="button-row">
        <button disabled={!online} onClick={onRun}>
          <ShieldCheck aria-hidden="true" />
          Run workspace preflight
        </button>
        {evidence ? (
          <a
            className="button-link"
            href="/evidence/live-demo-preflight.json"
            download
          >
            <Download aria-hidden="true" />
            Export preflight
          </a>
        ) : null}
      </div>
      {evidence ? (
        <p className="provenance-line">
          Captured {new Date(evidence.generatedAt).toLocaleString()} · AWS
          profile {evidence.aws?.profile ?? "unknown"} · secrets and account
          identity are redacted
        </p>
      ) : null}
    </article>
  );
}

function LifecyclePanelV2({
  run,
  actions,
  online,
  lifecycle,
  catalog,
  csrfToken,
  onRefresh,
  onRun,
}: {
  run: Run | null;
  actions: Action[];
  online: boolean;
  lifecycle: LifecycleState | null;
  catalog: Catalog | null;
  csrfToken: string;
  onRefresh: () => void;
  onRun: (
    actionId: string,
    control: (typeof lifecycleControls)[number],
    presenterCidr?: string,
  ) => void;
}) {
  const [presenterCidr, setPresenterCidr] = useState("");
  const [approvalPhrase,setApprovalPhrase]=useState("");
  const [retentionDecision,setRetentionDecision]=useState("RETAIN_PROTECTED_VOLUMES");
  const [approvalResult,setApprovalResult]=useState("");
  const apply=lifecycle?.apply;
  const approve=async(operation:"APPLY"|"DESTROY")=>{const plan=operation==="APPLY"?lifecycle?.apply:lifecycle?.destroy;if(!plan?.manifest)return;setApprovalResult(`[${new Date().toLocaleTimeString()}] Sending local approval request bound to ${plan.planHashPrefix}...`);const response=await fetch(`${agentBase}/lifecycle/approvals`,{method:"POST",headers:{"content-type":"application/json","x-lab-csrf":csrfToken},body:JSON.stringify({operation,planSha256:plan.manifest.planSha256,phrase:approvalPhrase,...(operation==="DESTROY"?{retentionDecision}:{})})});const body=await response.json();setApprovalResult(`[${new Date().toLocaleTimeString()}] ${response.ok?`APPROVED ${body.approval.id}; expires ${body.approval.expiresAt}. Mutation executor remains ${body.mutationExecutionEnabled?"enabled":"disabled"}.`:`REJECTED: ${body.message??body.error}`}`);onRefresh();};
  return (
    <article className="panel lifecycle-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">AWS LIFECYCLE · FIXED ALLOWLIST</p>
          <h2>Lab lifecycle controls</h2>
        </div>
        <Status>APPROVAL GATED</Status>
      </div>
      <label>
        Verified presenter IPv4 /32
        <input
          value={presenterCidr}
          onChange={(event) => setPresenterCidr(event.target.value)}
          placeholder="203.0.113.10/32"
        />
        <small>Used only by Terraform Plan after operator verification.</small>
      </label>
      <section className="teardown-review" aria-label="Saved plan approval contract">
        <div className="panel-title"><div><p className="eyebrow">IMMUTABLE SAVED PLAN</p><h3>{apply?.fresh?"Ready for explicit approval":"No fresh apply plan"}</h3></div><Status kind={apply?.fresh?"ok":"warn"}>{apply?.fresh?"FRESH":"BLOCKED"}</Status></div>
        {apply?.manifest?<><dl className="run-meta"><div><dt>Account</dt><dd>********{apply.accountSuffix}</dd></div><div><dt>Region</dt><dd>{apply.manifest.region}</dd></div><div><dt>Identity</dt><dd>{apply.manifest.deploymentIdentity}</dd></div><div><dt>Plan hash</dt><dd>{apply.manifest.planSha256}</dd></div><div><dt>Changes</dt><dd>{apply.manifest.changes.create} create · {apply.manifest.changes.update} update · {apply.manifest.changes.delete} delete</dd></div><div><dt>Exact command</dt><dd><code>{apply.manifest.exactCommand}</code></dd></div></dl><details className="behind-action"><summary>Inspect exact resource changes</summary><ul>{apply.manifest.changes.addresses.map(item=><li key={item.address}><code>{item.actions.join("+")} {item.address}</code></li>)}</ul></details><p>{apply.manifest.expectedEffects}</p></>:<p>{apply?.reasons.join(" ")??"Run Plan to generate a local manifest."}</p>}
        <label>Exact approval phrase<input value={approvalPhrase} onChange={event=>setApprovalPhrase(event.target.value)} placeholder={apply?.planHashPrefix?`APPROVE APPLY ${apply.planHashPrefix}`:"Plan required"}/></label>
        <div className="button-row"><button disabled={!online||!apply?.fresh||approvalPhrase!==`APPROVE APPLY ${apply.planHashPrefix}`} onClick={()=>void approve("APPLY")}><ShieldCheck aria-hidden="true"/>Approve exact apply plan</button><button disabled title="No real mutation executor is installed for this task."><CirclePlay aria-hidden="true"/>Deploy disabled</button></div>
        <p className="disabled-reason">Approval expires after 15 minutes and is bound to plan hash, configuration file set, AWS account, Region and deployment identity. Apply remains disabled until the separately authorized executor rehearsal.</p>
        <details className="behind-action"><summary>Teardown approval requirements</summary><p>{lifecycle?.destroy.fresh?"A fresh destroy plan is available.":lifecycle?.destroy.reasons.join(" ")}</p><label>Protected PostgreSQL volumes<select value={retentionDecision} onChange={event=>setRetentionDecision(event.target.value)}><option value="RETAIN_PROTECTED_VOLUMES">Retain protected volumes</option><option value="DELETE_PROTECTED_VOLUMES">Delete only after separate safeguard review</option></select></label><p>Destroy approval requires <code>APPROVE DESTROY &lt;destroy-plan-hash-prefix&gt;</code> and this explicit retention decision. No destroy plan or executor is currently enabled.</p></details>
        {approvalResult?<pre aria-live="polite">{approvalResult}</pre>:null}
      </section>
      <div className="lifecycle-grid">
        {lifecycleControls.map((control) => {
          const action = control.actionId
            ? actions.find((item) => item.id === control.actionId)
            : undefined;
          const planNeedsCidr =
            control.id === "lab-plan" &&
            !/^\d{1,3}(\.\d{1,3}){3}\/32$/.test(presenterCidr);
          const verifiedAwsTargets =
            catalog?.targets.filter(
              (target) =>
                target.available &&
                ["CASE_1", "CASE_2", "CASE_3"].includes(target.scenario) &&
                target.environment.startsWith("AWS_REAL"),
            ) ?? [];
          const runtimeBlockedReason =
            control.id === "lab-verify" && !lifecycle?.mutationExecutionEnabled
              ? "NOT_DEPLOYED — verification unlocks only after a separately authorized deployment executor is enabled."
              : control.id === "lab-benchmark" &&
                  verifiedAwsTargets.length !== 3
                ? "NOT_DEPLOYED — all three live AWS paths must first pass verification; historical evidence remains separate."
                : undefined;
          const disabled =
            Boolean(control.blockedReason) ||
            Boolean(runtimeBlockedReason) ||
            (control.id === "lab-export" && !run?.evidence) ||
            Boolean(control.actionId && (!online || !action)) ||
            planNeedsCidr;
          if (control.id === "lab-export")
            return (
              <a
                key={control.id}
                className={`button-link ${disabled ? "disabled" : ""}`}
                aria-disabled={disabled}
                href={run?.evidence ? `/${run.evidence}` : undefined}
                download
              >
                <Download aria-hidden="true" />
                <span>
                  <strong>{control.label}</strong>
                  <small>{control.detail}</small>
                </span>
              </a>
            );
          return (
            <button
              key={control.id}
              disabled={disabled}
              title={
                control.blockedReason ?? runtimeBlockedReason ??
                (planNeedsCidr
                  ? "Enter and verify one IPv4 /32 first."
                  : action?.preview)
              }
              onClick={() =>
                action &&
                onRun(
                  action.id,
                  control,
                  control.id === "lab-plan" ? presenterCidr : undefined,
                )
              }
            >
              {control.id === "lab-status" ? (
                <RefreshCw aria-hidden="true" />
              ) : control.risk === "DESTRUCTIVE" ? (
                <CircleStop aria-hidden="true" />
              ) : control.risk === "BILLABLE" ? (
                <CirclePlay aria-hidden="true" />
              ) : (
                <FileClock aria-hidden="true" />
              )}
              <span>
                <strong>{control.label}</strong>
                  <small>{control.blockedReason ?? runtimeBlockedReason ?? control.detail}</small>
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
}

function EnvironmentSelector({
  environment,
  onChange,
  catalog,
}: {
  environment: EnvironmentId;
  onChange: (value: EnvironmentId) => void;
  catalog: Catalog | null;
}) {
  const environments = Object.keys(environmentLabels) as EnvironmentId[];
  return (
    <section className="panel environment-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">EXECUTION CONTEXT</p>
          <h2>Environment selector</h2>
        </div>
        <Status>
          {catalog
            ? `DISCOVERED ${new Date(catalog.generatedAt).toLocaleTimeString()}`
            : "DISCOVERY PENDING"}
        </Status>
      </div>
      <div
        className="environment-grid"
        role="radiogroup"
        aria-label="Execution environment"
      >
        {environments.map((id) => {
          const targets =
              catalog?.targets.filter((item) => item.environment === id) ?? [],
            available =
              id === "LOCAL_EMULATION" ||
              targets.some((item) => item.available),
            reason = targets.find((item) => item.reason)?.reason;
          return (
            <button
              key={id}
              role="radio"
              aria-checked={environment === id}
              onClick={() => onChange(id)}
            >
              <span className="environment-icon">
                {id === "LOCAL_EMULATION" ? (
                  <Server aria-hidden="true" />
                ) : id.startsWith("AWS") ? (
                  <Cloud aria-hidden="true" />
                ) : (
                  <Globe2 aria-hidden="true" />
                )}
              </span>
              <span>
                <strong>{environmentLabels[id]}</strong>
                <small>
                  {available
                    ? "Available for supported scenarios"
                    : (reason ?? "Unavailable")}
                </small>
              </span>
              <Status kind={available ? "ok" : "warn"}>
                {available ? "AVAILABLE" : "UNAVAILABLE"}
              </Status>
            </button>
          );
        })}
      </div>
    </section>
  );
}
function ScenarioTabs({
  selected,
  onChange,
}: {
  selected: ScenarioId;
  onChange: (id: ScenarioId) => void;
}) {
  return (
    <div
      className="scenario-tabs"
      role="tablist"
      aria-label="Architecture scenarios"
    >
      {scenarios.map((item) => (
        <button
          id={`case-${item.number}`}
          key={item.id}
          role="tab"
          aria-selected={selected === item.id}
          onClick={() => onChange(item.id)}
        >
          <span>{item.number}</span>
          <strong>{item.title}</strong>
          <small>{item.subtitle}</small>
        </button>
      ))}
    </div>
  );
}

function ArchitectureMap({
  target,
  scenarioId,
  environment,
  running,
}: {
  target?: Target;
  scenarioId: ScenarioId;
  environment: EnvironmentId;
  running: boolean;
}) {
  const migration = scenarioId === "CASE_4",
    backup = scenarioId === "CASE_5",
    nodes = migration
      ? [
          "Singapore PostgreSQL",
          "Logical backup",
          "Isolated Hanoi target",
          "Verified cutover write",
        ]
      : backup
        ? [
            "Source PostgreSQL",
            "Logical backup",
            "Isolated recovery DB",
            "Sample verification",
          ]
        : [
            "Static frontend",
            target?.apiLocation ?? "API unavailable",
            target?.databaseLocation ?? "PostgreSQL unavailable",
          ];
  return (
    <article className="panel architecture-card">
      <div className="panel-title">
        <div>
          <p className="eyebrow">PHYSICAL + LOGICAL TOPOLOGY</p>
          <h2>Active request path</h2>
        </div>
        <Status
          kind={
            target?.available || environment === "LOCAL_EMULATION"
              ? "ok"
              : "warn"
          }
        >
          {environment}
        </Status>
      </div>
      <div className={`topology ${running ? "active" : ""}`}>
        {nodes.map((node, index) => (
          <div key={node} className="topology-node">
            <IconBox>
              {index === 0 ? (
                <Box />
              ) : index === nodes.length - 1 ? (
                <Database />
              ) : (
                <Server />
              )}
            </IconBox>
            <strong>{node}</strong>
            <small>
              {index === 0
                ? "frontend or source tier"
                : index === nodes.length - 1
                  ? "database / verification tier"
                  : "compute or transfer tier"}
            </small>
          </div>
        ))}
      </div>
      <dl className="facts">
        <div>
          <dt>Frontend</dt>
          <dd>{target?.frontendLocation ?? "Presenter localhost"}</dd>
        </div>
        <div>
          <dt>Network path</dt>
          <dd>
            {target?.networkPath ??
              (migration || backup
                ? "Local Compose-private workflow"
                : "Unavailable")}
          </dd>
        </div>
        <div>
          <dt>Provenance</dt>
          <dd>
            {target?.provenance ?? "No cloud identity or result is claimed."}
          </dd>
        </div>
        <div>
          <dt>Resource IDs</dt>
          <dd>
            {environment.startsWith("AWS")
              ? "Shown only after sanitized AWS discovery"
              : "Not applicable to local emulation"}
          </dd>
        </div>
      </dl>
    </article>
  );
}

function WorkflowPanel({
  scenario,
  actions,
  environment,
  online,
  available,
  onRun,
}: {
  scenario: (typeof scenarios)[number];
  actions: Action[];
  environment: EnvironmentId;
  online: boolean;
  available: boolean;
  onRun: (
    actionId: string,
    step: Step,
    extra?: Record<string, unknown>,
  ) => void;
}) {
  const [samples, setSamples] = useState(100),
    [warmups, setWarmups] = useState(5),
    [queryCount, setQueryCount] = useState(1);
  return (
    <article className="panel workflow-card">
      <div className="panel-title">
        <div>
          <p className="eyebrow">GUIDED WORKFLOW · CASE {scenario.number}</p>
          <h2>{scenario.title}</h2>
        </div>
        <Status>{scenario.steps.length} STEPS</Status>
      </div>
      <div className="benchmark-controls">
        <label>
          Measured samples
          <input
            type="number"
            min="1"
            max="300"
            value={samples}
            onChange={(event) =>
              setSamples(Math.max(1, Math.min(300, Number(event.target.value))))
            }
          />
        </label>
        <label>
          Warm-ups
          <input
            type="number"
            min="0"
            max="50"
            value={warmups}
            onChange={(event) =>
              setWarmups(Math.max(0, Math.min(50, Number(event.target.value))))
            }
          />
        </label>
        <label>
          SQL queries
          <select
            value={queryCount}
            onChange={(event) => setQueryCount(Number(event.target.value))}
          >
            {[1, 5, 10, 20].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <ol className="workflow-list">
        {scenario.steps.map((step, index) => {
          const action = step.actionId
              ? actions.find((item) => item.id === step.actionId)
              : undefined,
            scopeAllowed = Boolean(action?.environments.includes(environment)),
            diagnosticOnly = Boolean(
              action?.id.startsWith("aws.") || action?.id === "demo.preflight",
            ),
            disabled =
              !online ||
              (!available && !diagnosticOnly) ||
              !action ||
              !scopeAllowed ||
              Boolean(step.blockedReason),
            reason =
              step.blockedReason ??
              (!action
                ? "Informational/export step — no executor required."
                : !scopeAllowed
                  ? "Action is outside the selected environment scope."
                  : !available && !diagnosticOnly
                    ? "Environment is unavailable."
                    : ""),
            extra =
              step.actionId === "benchmark.run"
                ? { samples, warmups, queryCount }
                : undefined;
          return (
            <li key={step.id}>
              <span className="step-number">{index + 1}</span>
              <div>
                <div className="step-heading">
                  <strong>{step.label}</strong>
                  <Status
                    kind={
                      step.risk === "READ_ONLY"
                        ? "idle"
                        : step.risk === "TEST_WRITE"
                          ? "warn"
                          : "bad"
                    }
                  >
                    {riskLabel[step.risk]}
                  </Status>
                </div>
                <p>{step.detail}</p>
                {action ? (
                  <details className="behind-action">
                    <summary>
                      Behind the Action — inspect before execution
                    </summary>
                    <dl>
                      <div>
                        <dt>Purpose</dt>
                        <dd>{action.description}</dd>
                      </div>
                      <div>
                        <dt>Prerequisites</dt>
                        <dd>
                          Loopback agent online; selected environment and
                          scenario available; endpoint provenance validated.
                        </dd>
                      </div>
                      <div>
                        <dt>Target</dt>
                        <dd>
                          {environmentLabels[environment]} · Case{" "}
                          {scenario.number}
                        </dd>
                      </div>
                      <div>
                        <dt>Actual operation</dt>
                        <dd>
                          <code>{action.preview}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Expected changes</dt>
                        <dd>
                          {step.risk === "READ_ONLY"
                            ? "None. This operation reads state or sends benchmark GET requests."
                            : "Creates one clearly labelled synthetic order only; no infrastructure changes."}
                        </dd>
                      </div>
                      <div>
                        <dt>Risk / cost / confirmation</dt>
                        <dd>
                          {riskLabel[step.risk]} ·{" "}
                          {step.risk === "READ_ONLY"
                            ? "no AWS resource charge initiated; no confirmation required"
                            : "explicit browser confirmation required"}
                          .
                        </dd>
                      </div>
                      <div>
                        <dt>Expected outcome</dt>
                        <dd>
                          {action.idempotency} Retry: {action.retry}
                        </dd>
                      </div>
                    </dl>
                  </details>
                ) : null}
                {reason ? (
                  <small className="disabled-reason">{reason}</small>
                ) : null}
              </div>
              <button
                disabled={disabled}
                title={reason || action?.idempotency}
                onClick={() => action && onRun(action.id, step, extra)}
              >
                {step.risk === "READ_ONLY" ? (
                  <Play aria-hidden="true" />
                ) : (
                  <ShieldCheck aria-hidden="true" />
                )}
                {action ? "Execute" : "Inspect"}
              </button>
            </li>
          );
        })}
      </ol>
    </article>
  );
}

function SafeSequencePanel({
  items,
  state,
  disabled,
  canCancel,
  onRun,
  onPause,
  onSkip,
  onCancel,
}: {
  items: SequenceItem[];
  state: string;
  disabled: boolean;
  canCancel: boolean;
  onRun: () => void;
  onPause: () => void;
  onSkip: () => void;
  onCancel: () => void;
}) {
  const active = state === "RUNNING" || state === "PAUSED";
  return (
    <article className="panel safe-sequence">
      <div className="panel-title">
        <div>
          <p className="eyebrow">FIXED READ-ONLY ALLOWLIST</p>
          <h2>Run Safe Workflow</h2>
        </div>
        <Status
          kind={
            state === "SUCCEEDED"
              ? "ok"
              : state === "FAILED" || state === "CANCELLED"
                ? "bad"
                : active
                  ? "warn"
                  : "idle"
          }
        >
          {state}
        </Status>
      </div>
      <p className="panel-copy">
        Runs only server-declared <code>safeAutomatic</code> read-only
        operations. It cannot apply/destroy Terraform, start/stop EC2, create
        snapshots, overwrite databases or run arbitrary shell input.
      </p>
      <div className="sequence-strip">
        {items.length ? (
          items.map((item, index) => (
            <div key={`${item.actionId}-${index}`}>
              <span>{index + 1}</span>
              <strong>{item.label}</strong>
              <Status
                kind={
                  item.state === "SUCCEEDED"
                    ? "ok"
                    : item.state === "FAILED" || item.state === "CANCELLED"
                      ? "bad"
                      : item.state === "RUNNING"
                        ? "warn"
                        : "idle"
                }
              >
                {item.state}
              </Status>
            </div>
          ))
        ) : (
          <p>No sequence has run in this workspace session.</p>
        )}
      </div>
      <div className="button-row">
        <button disabled={disabled || active} onClick={onRun}>
          <CirclePlay aria-hidden="true" />
          Run safe workflow
        </button>
        <button disabled={!active} onClick={onPause}>
          <CirclePause aria-hidden="true" />
          {state === "PAUSED" ? "Resume" : "Pause after step"}
        </button>
        <button disabled={!active} onClick={onSkip}>
          <SkipForward aria-hidden="true" />
          Skip next safe step
        </button>
        <button
          className="danger"
          disabled={!active || !canCancel}
          title={
            canCancel
              ? "Cancel the active child process"
              : "Current HTTP operation cannot be safely cancelled after dispatch"
          }
          onClick={onCancel}
        >
          <CircleStop aria-hidden="true" />
          Cancel active
        </button>
      </div>
      <small className="disabled-reason">
        Pause and skip take effect only between operations. Cancel is enabled
        only for a child process the agent owns. Skipped or cancelled steps are
        never marked succeeded.
      </small>
    </article>
  );
}

function ExecutionTerminal({
  run,
  log,
  onCancel,
  onRetry,
  canRetry,
  canCancel,
}: {
  run: Run | null;
  log: string;
  onCancel: () => void;
  onRetry: () => void;
  canRetry: boolean;
  canCancel: boolean;
}) {
  const pre = useRef<HTMLPreElement>(null);
  useEffect(() => {
    if (pre.current) pre.current.scrollTop = pre.current.scrollHeight;
  }, [log]);
  const state = run?.state ?? "IDLE";
  return (
    <section className="panel terminal-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">ACTUAL EXECUTION STREAM</p>
          <h2>Trusted localhost terminal</h2>
        </div>
        <div className="button-row">
          <Status
            kind={
              state === "SUCCEEDED"
                ? "ok"
                : state === "FAILED" || state === "CANCELLED"
                  ? "bad"
                  : state === "RUNNING"
                    ? "warn"
                    : "idle"
            }
          >
            {state}
          </Status>
          {run?.state === "RUNNING" && canCancel ? (
            <button className="danger" onClick={onCancel}>
              <CircleStop aria-hidden="true" />
              Cancel process
            </button>
          ) : null}
          <button
            disabled={!canRetry || run?.state === "RUNNING"}
            onClick={onRetry}
          >
            <RotateCcw aria-hidden="true" />
            Retry last
          </button>
          <button onClick={() => void navigator.clipboard.writeText(log)}>
            <Clipboard aria-hidden="true" />
            Copy sanitized log
          </button>
        </div>
      </div>
      {run ? (
        <dl className="run-meta">
          <div>
            <dt>Action ID</dt>
            <dd>{run.actionId}</dd>
          </div>
          <div>
            <dt>Risk</dt>
            <dd>{run.risk}</dd>
          </div>
          <div>
            <dt>Started</dt>
            <dd>{new Date(run.startedAt).toLocaleString()}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>
              {run.durationMs == null ? "Running" : `${run.durationMs} ms`}
            </dd>
          </div>
          <div>
            <dt>Exit / API</dt>
            <dd>{run.exitCode ?? "—"}</dd>
          </div>
          <div>
            <dt>Evidence</dt>
            <dd>{run.evidence ?? "Pending / none"}</dd>
          </div>
        </dl>
      ) : null}
      <pre ref={pre} aria-live="polite" aria-label="Sanitized execution output">
        {log}
      </pre>
      {run?.validation ? (
        <p
          className={`validation ${run.state === "SUCCEEDED" ? "pass" : "fail"}`}
        >
          {run.validation}
        </p>
      ) : null}
    </section>
  );
}

function BenchmarkPanel({
  environment,
  evidence,
}: {
  environment: EnvironmentId;
  evidence: BenchmarkEvidence[];
}) {
  return (
    <section className="panel benchmark-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">ENVIRONMENT-ISOLATED EVIDENCE</p>
          <h2>Benchmark history · {environmentLabels[environment]}</h2>
        </div>
        <Status kind={evidence.length ? "ok" : "idle"}>
          {evidence.length ? `${evidence.length} GROUPS` : "NO RUNS"}
        </Status>
      </div>
      {!evidence.length ? (
        <div className="empty">
          <FileClock aria-hidden="true" />
          <strong>No benchmark evidence in this environment</strong>
          <p>
            Run a measured workflow. Results from other environments remain
            hidden.
          </p>
        </div>
      ) : (
        <>
          <LatencyChart evidence={evidence.slice(0, 8)} />
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Queries</th>
                  <th>Count/errors</th>
                  <th>Mean</th>
                  <th>p50</th>
                  <th>p95</th>
                  <th>p99</th>
                  <th>Std dev</th>
                  <th>DB mean</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((item, index) => {
                  const db = item.rawSamples.filter(
                      (sample) => sample.serverDbMs != null,
                    ),
                    dbMean = db.length
                      ? db.reduce(
                          (sum, sample) => sum + (sample.serverDbMs ?? 0),
                          0,
                        ) / db.length
                      : null;
                  return (
                    <tr key={`${item.scenario}-${item.queryCount}-${index}`}>
                      <td>
                        <Status kind={item.source === "LIVE" ? "ok" : "warn"}>
                          {item.source}
                        </Status>
                      </td>
                      <td>{item.queryCount}</td>
                      <td>
                        {item.metrics.count}/{item.metrics.errors} (
                        {item.metrics.errorRate.toFixed(1)}%)
                      </td>
                      <td>{fmt(item.metrics.mean)}</td>
                      <td>{fmt(item.metrics.p50)}</td>
                      <td>{fmt(item.metrics.p95)}</td>
                      <td>{fmt(item.metrics.p99)}</td>
                      <td>{fmt(item.metrics.standardDeviation)}</td>
                      <td>{fmt(dbMean)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
function LatencyChart({ evidence }: { evidence: BenchmarkEvidence[] }) {
  const max = Math.max(
    1,
    ...evidence.flatMap((item) => [
      item.metrics.p50 ?? 0,
      item.metrics.p95 ?? 0,
      item.metrics.p99 ?? 0,
    ]),
  );
  return (
    <div
      className="latency-chart"
      role="img"
      aria-label="Latency percentile comparison; exact values are also available in the table below"
    >
      {evidence.map((item, index) => (
        <div
          className="chart-group"
          key={`${item.scenario}-${item.queryCount}-${index}`}
        >
          <strong>
            {item.scenario} · {item.queryCount} SQL · {item.source}
          </strong>
          {(["p50", "p95", "p99"] as const).map((metric) => (
            <div className="chart-row" key={metric}>
              <span>{metric}</span>
              <div className="chart-track">
                <i
                  style={{
                    width: `${Math.max(1, ((item.metrics[metric] ?? 0) / max) * 100)}%`,
                  }}
                />
              </div>
              <b>{fmt(item.metrics[metric])}</b>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function PreviousEvidencePanel({ cards }: { cards: EvidenceCard[] }) {
  return (
    <section className="panel previous-evidence">
      <div className="panel-title">
        <div>
          <p className="eyebrow">FALLBACK · NOT LIVE</p>
          <h2>Previously Verified Evidence</h2>
        </div>
        <Status kind="warn">REPLAY LABEL REQUIRED</Status>
      </div>
      <Notice>
        <strong>Never present these files as a live operation.</strong>
        <p>
          Use only when a live endpoint or authentication cannot recover on
          stage. The capture timestamp and provenance must remain visible.
        </p>
      </Notice>
      <div className="evidence-grid">
        {cards.length ? (
          cards.map((card) => (
            <a
              key={card.path}
              href={card.path}
              target="_blank"
              rel="noreferrer"
            >
              <FileClock aria-hidden="true" />
              <span>
                <strong>{card.title}</strong>
                <small>{card.detail}</small>
              </span>
              <ExternalLink aria-hidden="true" />
            </a>
          ))
        ) : (
          <p>No previously verified evidence files were discovered.</p>
        )}
      </div>
    </section>
  );
}
function RecoveryPanel({
  onRefresh,
  onRetry,
  onClose,
}: {
  onRefresh: () => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <section className="panel recovery-panel" role="alert">
      <div className="panel-title">
        <div>
          <p className="eyebrow">PRESENTER RECOVERY MODE</p>
          <h2>Do not infer success from an interrupted operation</h2>
        </div>
        <button onClick={onClose}>Close</button>
      </div>
      <div className="recovery-grid">
        <div>
          <strong>Expired SSO</strong>
          <p>
            Run <code>aws sso login --profile &lt;authorized-profile&gt;</code> in
            an operator terminal, then refresh discovery and rerun preflight.
          </p>
        </div>
        <div>
          <strong>Presenter IP changed</strong>
          <p>
            Preflight reports the mismatch. Do not edit Terraform or security
            groups from this console.
          </p>
        </div>
        <div>
          <strong>Endpoint unavailable</strong>
          <p>
            Check lab status, inspect sanitized logs, retry only the fixed
            operation or use clearly labelled prior evidence.
          </p>
        </div>
        <div>
          <strong>Interrupted migration/backup</strong>
          <p>
            Inspect row counts/checksums and isolated targets before any retry.
            Automatic recovery never overwrites a database.
          </p>
        </div>
      </div>
      <div className="button-row">
        <button onClick={onRefresh}>
          <RefreshCw aria-hidden="true" />
          Refresh discovery
        </button>
        <button onClick={onRetry}>
          <RotateCcw aria-hidden="true" />
          Retry last fixed action
        </button>
        <a className="button-link" href="#preflight">
          <ShieldCheck aria-hidden="true" />
          Return to preflight
        </a>
      </div>
    </section>
  );
}

function InspectionPanel({
  catalog,
  actions,
}: {
  catalog: Catalog | null;
  actions: Action[];
}) {
  return (
    <section className="panel inspection">
      <div className="panel-title">
        <div>
          <p className="eyebrow">ADVANCED INSPECTION</p>
          <h2>Allowlist and unavailable workflows</h2>
        </div>
        <Status>{actions.length} ACTIONS</Status>
      </div>
      <details>
        <summary>
          <Terminal aria-hidden="true" />
          Executable allowlist <ChevronDown aria-hidden="true" />
        </summary>
        <div className="inspection-list">
          {actions.map((action) => (
            <div key={action.id}>
              <code>{action.id}</code>
              <span>{action.preview}</span>
              <Status
                kind={
                  action.safeAutomatic
                    ? "ok"
                    : action.risk === "READ_ONLY"
                      ? "idle"
                      : "warn"
                }
              >
                {action.safeAutomatic ? "SAFE AUTO" : action.risk}
              </Status>
            </div>
          ))}
        </div>
      </details>
      <details>
        <summary>
          <AlertTriangle aria-hidden="true" />
          Explicitly unavailable workflows <ChevronDown aria-hidden="true" />
        </summary>
        <div className="inspection-list">
          {catalog?.unavailableWorkflows.map((item) => (
            <div key={item.id}>
              <code>{item.id}</code>
              <span>{item.reason}</span>
              <Status kind="bad">{item.status}</Status>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
function ConclusionPanel() {
  return (
    <article className="panel conclusion">
      <div>
        <p className="eyebrow">TECHNICAL FINDINGS</p>
        <h2>Trust the provenance, not a status badge.</h2>
        <p>
          The workspace executes genuine allowlisted HTTP, PostgreSQL and
          read-only AWS diagnostics. Local delay is illustrative. Real AWS
          numbers appear only as timestamped historical evidence until a new
          deployment is independently verified.
        </p>
      </div>
      <div className="conclusion-grid">
        <div>
          <CheckCircle2 aria-hidden="true" />
          <strong>Historical Cases 1–3 verified</strong>
          <span>
            The retained Singapore, Hanoi Local Zone and hybrid benchmark run
            succeeded before the previous environment was destroyed.
          </span>
        </div>
        <div>
          <AlertTriangle aria-hidden="true" />
          <strong>Current AWS: NOT_DEPLOYED</strong>
          <span>
            Cases 4–5 remain unverified; migration, EBS snapshot creation and
            restore require separate tasks.
          </span>
        </div>
        <div>
          <Globe2 aria-hidden="true" />
          <strong>Theory only</strong>
          <span>
            Cross-cloud backup/DR to a second Vietnamese provider is not
            provisioned.
          </span>
        </div>
      </div>
    </article>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    {["/demo", "/present"].includes(location.pathname) ? <App /> : <Portal />}
  </StrictMode>,
);
