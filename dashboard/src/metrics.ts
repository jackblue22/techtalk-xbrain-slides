export type Sample = { timestamp: string; scenario: string; origin: string; destination: string; method: string; path: string; payloadBytes: number; status: number; ok: boolean; requestId: string|null; clientElapsedMs: number; serverTiming: string|null; serverAppMs: number|null; dbMs: number|null };
export type Metrics = { count: number; p50: number; p95: number; p99: number; min: number; max: number; average: number; standardDeviation: number; throughputPerSecond: number; timeoutRate: number; httpVariation: number };

const round = (value: number) => Number(value.toFixed(2));
export function percentile(sorted: number[], value: number) {
  if (!sorted.length) return 0;
  const rank = (sorted.length - 1) * value;
  const low = Math.floor(rank); const high = Math.ceil(rank); const weight = rank - low;
  return (sorted[low] ?? 0) * (1 - weight) + (sorted[high] ?? 0) * weight;
}
export function calculateMetrics(samples: Sample[]): Metrics | null {
  if (!samples.length) return null;
  const values = samples.map(sample => sample.clientElapsedMs).sort((a,b) => a-b);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value-average) ** 2, 0) / values.length;
  let variation = 0; for (let index=1; index<samples.length; index += 1) variation += Math.abs(samples[index]!.clientElapsedMs - samples[index-1]!.clientElapsedMs);
  const first = Date.parse(samples[0]!.timestamp); const last = Date.parse(samples.at(-1)!.timestamp); const seconds = Math.max((last-first)/1000, values.reduce((a,b)=>a+b,0)/1000, .001);
  return { count: values.length, p50: round(percentile(values,.5)), p95: round(percentile(values,.95)), p99: round(percentile(values,.99)), min: round(values[0]!), max: round(values.at(-1)!), average: round(average), standardDeviation: round(Math.sqrt(variance)), throughputPerSecond: round(values.length/seconds), timeoutRate: round(samples.filter(sample => !sample.ok || sample.status === 0).length / samples.length * 100), httpVariation: round(samples.length > 1 ? variation/(samples.length-1) : 0) };
}
export function parseServerTiming(header: string|null) {
  const find = (name: string) => { const match = header?.match(new RegExp(`${name};dur=([0-9.]+)`)); return match ? Number(match[1]) : null; };
  return { app: find('app'), db: find('db') };
}

