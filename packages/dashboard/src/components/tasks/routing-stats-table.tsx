import { useEffect, useState } from "react";
import { clsx } from "clsx";
import {
  fetchRoutingStats,
  type RoutingStatsRow,
} from "../../lib/api.ts";
import { getRoutingStatsSummary } from "./task-utils.ts";

export function RoutingStatsTable() {
  const [stats, setStats] = useState<RoutingStatsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadStats() {
    try {
      setError(null);
      const rows = await fetchRoutingStats();
      setStats(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown routing stats error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStats();
  }, []);

  if (loading && stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-12">
        <p className="text-sm text-gray-500">Loading routing stats...</p>
      </div>
    );
  }

  if (error && stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-12">
        <p className="text-sm text-red-400">Failed to load routing stats</p>
        <p className="mt-1 text-xs text-gray-600">{error}</p>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-12">
        <p className="text-sm text-gray-500">No routing stats yet</p>
        <p className="mt-1 text-xs text-gray-600">
          Stats appear after agents complete tasks through the router
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-3">
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="button"
          onClick={() => {
            setLoading(true);
            void loadStats();
          }}
          disabled={loading}
          className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:text-gray-200 disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">
          <span className="w-36 shrink-0">Agent</span>
          <span className="w-28 shrink-0">Category</span>
          <span className="w-48 shrink-0">Success Rate</span>
          <span className="w-20 shrink-0 text-right">Avg Latency</span>
          <span className="w-20 shrink-0 text-right">Total Cost</span>
          <span className="w-16 shrink-0 text-right">Tasks</span>
        </div>

        {stats.map((row) => {
          const summary = getRoutingStatsSummary(row);

          return (
            <div
              key={`${row.agent_name}-${row.category}`}
              className="flex items-center gap-3 border-b border-gray-800 px-4 py-3 text-sm last:border-b-0"
            >
              <span className="w-36 shrink-0 truncate font-medium text-gray-200">
                {row.agent_name}
              </span>

              <span className="w-28 shrink-0">
                <span className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400">
                  {row.category}
                </span>
              </span>

              <div className="flex w-48 shrink-0 items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-800">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all duration-500",
                      summary.successRate >= 80
                        ? "bg-emerald-500 shadow-sm shadow-emerald-500/30"
                        : summary.successRate >= 50
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    )}
                    style={{ width: `${summary.successRate}%` }}
                  />
                </div>
                <span
                  className={clsx(
                    "w-12 text-right font-mono text-xs",
                    summary.successRate >= 80
                      ? "text-emerald-400"
                      : summary.successRate >= 50
                        ? "text-yellow-400"
                        : "text-red-400"
                  )}
                >
                  {summary.successRate.toFixed(0)}%
                </span>
              </div>

              <span className="w-20 shrink-0 text-right text-gray-400">
                {summary.averageLatencyMs > 0
                  ? `${summary.averageLatencyMs}ms`
                  : "—"}
              </span>

              <span className="w-20 shrink-0 text-right text-gray-400">
                {row.total_cost > 0 ? `$${row.total_cost.toFixed(2)}` : "—"}
              </span>

              <span className="w-16 shrink-0 text-right text-gray-500">
                {summary.total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
