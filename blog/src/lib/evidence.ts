import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ScenarioKey = "singapore" | "hanoi" | "hybrid";
export type MetricKey = "httpP50" | "httpP95" | "httpP99" | "appP50" | "dbP50";

type RawSample = {
  scenario: string;
  queryCount: number;
  ok: boolean;
  clientElapsedMs: number;
  serverAppMs: number;
  serverDbMs: number;
};

type Summary = {
  scenario: string;
  queryCount: number;
  metrics: {
    count: number;
    errors: number;
    p50: number;
    p95: number;
    p99: number;
  };
};

type Evidence = {
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
  warmups: unknown[];
  rawSamples: RawSample[];
  limitations: string[];
};

export type EvidencePoint = {
  queryCount: number;
  samples: number;
  errors: number;
  httpP50: number;
  httpP95: number;
  httpP99: number;
  appP50: number;
  dbP50: number;
};

export type EvidenceView = {
  runId: string;
  status: string;
  mode: string;
  date: string;
  origin: string;
  measuredRequests: number;
  excludedWarmups: number;
  concurrency: number;
  series: Record<ScenarioKey, EvidencePoint[]>;
};

const scenarioMap: Record<string, ScenarioKey> = {
  AWS_REAL_SINGAPORE: "singapore",
  AWS_REAL_HANOI: "hanoi",
  AWS_REAL_HYBRID: "hybrid"
};

function percentile(values: number[], percentileValue: number) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const index = Math.max(0, Math.ceil(sorted.length * percentileValue) - 1);
  return sorted[index];
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function loadEvidence(): EvidenceView {
  const evidencePath = resolve(process.cwd(), "../evidence/aws-real-benchmark-latest.json");
  const evidence = JSON.parse(readFileSync(evidencePath, "utf8").replace(/^\uFEFF/, "")) as Evidence;

  const series: Record<ScenarioKey, EvidencePoint[]> = {
    singapore: [],
    hanoi: [],
    hybrid: []
  };

  for (const summary of evidence.summaries) {
    const scenario = scenarioMap[summary.scenario];
    if (!scenario) continue;
    const samples = evidence.rawSamples.filter(
      (sample) => sample.ok && sample.scenario === summary.scenario && sample.queryCount === summary.queryCount
    );

    series[scenario].push({
      queryCount: summary.queryCount,
      samples: summary.metrics.count,
      errors: summary.metrics.errors,
      httpP50: summary.metrics.p50,
      httpP95: summary.metrics.p95,
      httpP99: summary.metrics.p99,
      appP50: round(percentile(samples.map((sample) => sample.serverAppMs), 0.5)),
      dbP50: round(percentile(samples.map((sample) => sample.serverDbMs), 0.5))
    });
  }

  for (const points of Object.values(series)) {
    points.sort((a, b) => a.queryCount - b.queryCount);
  }

  return {
    runId: evidence.runId,
    status: evidence.status,
    mode: evidence.mode,
    date: evidence.completedAt,
    origin: evidence.configuration.origin,
    measuredRequests: evidence.rawSamples.length,
    excludedWarmups: evidence.warmups.length,
    concurrency: evidence.configuration.concurrency,
    series
  };
}
