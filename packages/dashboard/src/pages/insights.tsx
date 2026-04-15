import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, Bot, Gauge, ReceiptText, RefreshCw, TriangleAlert } from "lucide-react";
import {
  insightsApi,
  type AgentSummary,
  type CostRow,
  type Overview,
  type TimeseriesResponse,
} from "../lib/insights-api.ts";

function StatTile(props: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Activity;
  accent: string;
}) {
  const { accent, detail, icon: Icon, label, value } = props;

  return (
    <article className="surface-panel relative overflow-hidden px-4 py-4">
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
      />
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-label">{label}</p>
          <div className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-[var(--text-strong)]">
            {value}
          </div>
          <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{detail}</p>
        </div>
        <div
          className="flex h-11 w-11 items-center justify-center rounded-2xl border"
          style={{
            borderColor: "var(--border-soft)",
            background: `color-mix(in oklch, ${accent}, transparent 84%)`,
            color: accent,
          }}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

function formatCurrency(value: string | number) {
  return `$${Number(value).toFixed(4)}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function formatLatency(value: number | null) {
  return value === null ? "—" : `${Math.round(value)}ms`;
}

export function InsightsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [throughput, setThroughput] = useState<TimeseriesResponse | null>(null);
  const [cost, setCost] = useState<CostRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsRefreshing(true);
        const [nextOverview, nextAgents, nextThroughput, nextCost] = await Promise.all([
          insightsApi.overview(),
          insightsApi.agents(),
          insightsApi.tasksTimeseries("throughput", "24h", "5m"),
          insightsApi.costBreakdown("agent", "24h"),
        ]);
        if (!cancelled) {
          setOverview(nextOverview);
          setAgents(nextAgents);
          setThroughput(nextThroughput);
          setCost(nextCost.rows);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : String(loadError));
        }
      } finally {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      }
    }

    void load();
    const intervalId = window.setInterval(() => void load(), 15_000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  return (
    <div className="space-y-8">
      <section className="surface-panel-strong relative overflow-hidden px-6 py-6">
        <div className="absolute inset-y-0 right-0 w-[32rem] bg-[radial-gradient(circle_at_center,_rgba(102,179,255,0.16),_transparent_60%)]" />
        <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="page-header-eyebrow">Insights service</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-strong)]">
              Track throughput, agent reliability, and spend without leaving mission control.
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              This view turns the Python analytics service into an operator-facing console. It
              stays readable for triage, but still exposes enough signal to spot degraded agents,
              rising latency, and uneven cost.
            </p>
          </div>
          <div className="surface-muted flex min-w-[16rem] items-center justify-between gap-4 px-4 py-3">
            <div>
              <div className="section-label">Refresh cadence</div>
              <div className="mt-1 text-sm font-medium text-[var(--text-strong)]">
                15 second analytics sweep
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              {isRefreshing ? "Refreshing" : "Live snapshot"}
            </div>
          </div>
        </div>
      </section>

      {error ? (
        <section className="surface-panel border-[color:var(--danger)]/40 px-5 py-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-300">
              <TriangleAlert className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--text-strong)]">
                Insights service unreachable
              </h2>
              <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                The dashboard could not load analytics from `VITE_INSIGHTS_URL` or the local
                fallback at `http://localhost:8000`.
              </p>
              <p className="mt-2 text-sm text-rose-200">{error}</p>
            </div>
          </div>
        </section>
      ) : null}

      {overview ? (
        <>
          <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <StatTile
              label="Throughput"
              value={String(overview.throughput)}
              detail="Tasks recorded by the analytics service in the last 24 hours."
              icon={Activity}
              accent="var(--accent-secondary)"
            />
            <StatTile
              label="Success rate"
              value={formatPercent(overview.success_rate)}
              detail={`${overview.failed_count} tasks ended failed or canceled in the same window.`}
              icon={Gauge}
              accent="var(--success)"
            />
            <StatTile
              label="p95 latency"
              value={formatLatency(overview.p95_latency_ms)}
              detail={`Median latency is ${formatLatency(overview.p50_latency_ms)} across completed work.`}
              icon={Bot}
              accent="var(--warning)"
            />
            <StatTile
              label="Total cost"
              value={formatCurrency(overview.total_cost)}
              detail="Aggregated reported execution cost across tracked tasks."
              icon={ReceiptText}
              accent="var(--accent-primary)"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
            <article className="surface-panel px-5 py-5">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="section-label">Task rhythm</p>
                  <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--text-strong)]">
                    Throughput over five-minute buckets
                  </h2>
                </div>
                <p className="text-xs uppercase tracking-[0.22em] text-[var(--text-soft)]">
                  last 24h
                </p>
              </div>
              <div className="mt-5 h-72">
                <ResponsiveContainer>
                  <LineChart data={throughput?.points ?? []}>
                    <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="3 5" />
                    <XAxis
                      dataKey="ts"
                      tick={{ fill: "rgba(148, 163, 184, 0.85)", fontSize: 11 }}
                      tickFormatter={(value) =>
                        new Date(value).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      }
                    />
                    <YAxis tick={{ fill: "rgba(148, 163, 184, 0.85)", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(9, 15, 28, 0.96)",
                        border: "1px solid rgba(148, 163, 184, 0.18)",
                        borderRadius: "16px",
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="rgba(122, 210, 255, 0.96)"
                      strokeWidth={2.5}
                      dot={false}
                      activeDot={{ r: 4, fill: "rgba(122, 210, 255, 1)" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>

            <article className="surface-panel px-5 py-5">
              <div>
                <p className="section-label">Spend distribution</p>
                <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[var(--text-strong)]">
                  Cost by agent
                </h2>
              </div>
              <div className="mt-5 h-72">
                <ResponsiveContainer>
                  <BarChart data={cost.map((row) => ({ ...row, cost: Number(row.cost) }))}>
                    <CartesianGrid stroke="rgba(148, 163, 184, 0.12)" strokeDasharray="3 5" />
                    <XAxis dataKey="key" tick={{ fill: "rgba(148, 163, 184, 0.85)", fontSize: 11 }} />
                    <YAxis tick={{ fill: "rgba(148, 163, 184, 0.85)", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: "rgba(9, 15, 28, 0.96)",
                        border: "1px solid rgba(148, 163, 184, 0.18)",
                        borderRadius: "16px",
                      }}
                    />
                    <Legend />
                    <Bar dataKey="cost" fill="rgba(118, 163, 255, 0.9)" radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </section>

          <section className="surface-panel overflow-hidden">
            <div className="table-header">
              <span className="min-w-[12rem]">Agent</span>
              <span>Tasks</span>
              <span>Success</span>
              <span>p50</span>
              <span>p95</span>
              <span>Cost</span>
            </div>
            <div className="divide-y divide-[color:var(--border-soft)]">
              {agents.map((agent) => (
                <div
                  key={agent.agent}
                  className="grid gap-3 px-4 py-4 text-sm text-[var(--text-main)] md:grid-cols-[minmax(12rem,1.3fr)_0.6fr_0.8fr_0.8fr_0.8fr_0.9fr]"
                >
                  <div>
                    <div className="font-medium text-[var(--text-strong)]">{agent.agent}</div>
                    <div className="mt-1 text-xs text-[var(--text-soft)]">
                      Analytics service summary
                    </div>
                  </div>
                  <div>{agent.task_count}</div>
                  <div>{formatPercent(agent.success_rate)}</div>
                  <div>{formatLatency(agent.p50_latency_ms)}</div>
                  <div>{formatLatency(agent.p95_latency_ms)}</div>
                  <div>{formatCurrency(agent.total_cost)}</div>
                </div>
              ))}
              {agents.length === 0 ? (
                <div className="px-4 py-10 text-sm text-[var(--text-muted)]">
                  No agent analytics yet. Dispatch a task and wait for the insights poll cycle.
                </div>
              ) : null}
            </div>
          </section>
        </>
      ) : (
        <section className="surface-panel px-5 py-12 text-sm text-[var(--text-muted)]">
          Loading analytics from the Insights service.
        </section>
      )}
    </div>
  );
}
