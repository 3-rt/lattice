const BASE = import.meta.env.VITE_INSIGHTS_URL ?? "http://localhost:8000";
const PREFIX = `${BASE}/api/v1/insights`;

export interface Overview {
  range: string;
  throughput: number;
  success_rate: number;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  total_cost: string;
  failed_count: number;
}

export interface AgentSummary {
  agent: string;
  task_count: number;
  success_rate: number;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  total_cost: string;
}

export interface TimeseriesPoint {
  ts: string;
  value: number | null;
}

export interface TimeseriesResponse {
  metric: string;
  bucket: string;
  range: string;
  points: TimeseriesPoint[];
}

export interface CostRow {
  key: string;
  cost: string;
}

async function getJSON<T>(path: string): Promise<T> {
  const response = await fetch(`${PREFIX}${path}`);
  if (!response.ok) {
    throw new Error(`${path} ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const insightsApi = {
  overview: (range = "24h") => getJSON<Overview>(`/overview?range=${range}`),
  agents: (range = "24h") =>
    getJSON<{ agents: AgentSummary[] }>(`/agents?range=${range}`).then((body) => body.agents),
  tasksTimeseries: (metric = "throughput", range = "24h", bucket = "5m") =>
    getJSON<TimeseriesResponse>(
      `/tasks/timeseries?metric=${metric}&range=${range}&bucket=${bucket}`
    ),
  costBreakdown: (groupBy = "agent", range = "24h") =>
    getJSON<{ group_by: string; range: string; rows: CostRow[] }>(
      `/cost/breakdown?groupBy=${groupBy}&range=${range}`
    ),
};
