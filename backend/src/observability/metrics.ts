// In-process API metrics — request counts, p95 latency, error rates.
// Kept in memory and exposed via getMetricsSummary(); wired into a Fastify onResponse hook.

type Bucket = {
  count: number;
  errorCount: number;
  latencies: number[]; // bounded to MAX_LATENCIES per bucket
};

const MAX_LATENCIES = 200;
const buckets = new Map<string, Bucket>();

function key(method: string, route: string): string {
  return `${method.toUpperCase()} ${route}`;
}

function getOrCreate(k: string): Bucket {
  let b = buckets.get(k);
  if (!b) {
    b = { count: 0, errorCount: 0, latencies: [] };
    buckets.set(k, b);
  }
  return b;
}

function p95(latencies: number[]): number {
  if (latencies.length === 0) return 0;
  const sorted = [...latencies].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * 0.95);
  return sorted[Math.min(idx, sorted.length - 1)];
}

/** Called by Fastify `onResponse` hook for every request. */
export function recordRequest(
  method: string,
  route: string,
  statusCode: number,
  durationMs: number,
): void {
  const b = getOrCreate(key(method, route));
  b.count++;
  if (statusCode >= 500) b.errorCount++;
  b.latencies.push(durationMs);
  if (b.latencies.length > MAX_LATENCIES) b.latencies.shift();
}

export type MetricRow = {
  route: string;
  count: number;
  errorRate: string;
  p95Ms: number;
};

/** Returns a sorted summary of all recorded routes. */
export function getMetricsSummary(): MetricRow[] {
  return [...buckets.entries()]
    .map(([route, b]) => ({
      route,
      count: b.count,
      errorRate: b.count > 0 ? `${((b.errorCount / b.count) * 100).toFixed(1)}%` : "0.0%",
      p95Ms: p95(b.latencies),
    }))
    .sort((a, b) => b.count - a.count);
}

/** Resets all metrics — useful in tests. */
export function resetMetrics(): void {
  buckets.clear();
}
