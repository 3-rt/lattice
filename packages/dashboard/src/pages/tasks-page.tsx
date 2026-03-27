import { useEffect, useState } from "react";
import { clsx } from "clsx";
import { fetchTasks } from "../lib/api.ts";
import { useLatticeStore } from "../store/lattice-store.ts";
import { RoutingStatsTable } from "../components/tasks/routing-stats-table.tsx";
import { TaskTable } from "../components/tasks/task-table.tsx";

type Tab = "history" | "stats";

const tabs: Array<{ id: Tab; label: string }> = [
  { id: "history", label: "Task History" },
  { id: "stats", label: "Routing Stats" },
];

export function TasksPage() {
  const setTasks = useLatticeStore((state) => state.setTasks);
  const [activeTab, setActiveTab] = useState<Tab>("history");
  const [statusFilter, setStatusFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [tasksError, setTasksError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTasks() {
      try {
        setTasksError(null);
        const tasks = await fetchTasks();
        if (!cancelled) {
          setTasks(tasks);
        }
      } catch (err) {
        if (!cancelled) {
          setTasksError(err instanceof Error ? err.message : "Unknown tasks error");
        }
      } finally {
        if (!cancelled) {
          setLoadingTasks(false);
        }
      }
    }

    void loadTasks();

    return () => {
      cancelled = true;
    };
  }, [setTasks]);

  return (
    <div className="space-y-8">
      <div className="page-header">
        <p className="page-header-eyebrow">Operations history</p>
        <h1 className="page-title">Review task outcomes and routing behavior.</h1>
        <p className="page-description">
          Use history for triage and audit trails, then switch to routing stats
          when you need to understand agent performance patterns.
        </p>
      </div>

      <div className="surface-panel inline-flex gap-1 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "bg-white/10 text-[var(--text-strong)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-strong)]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={clsx(activeTab !== "history" && "hidden")}>
        <TaskTable
          statusFilter={statusFilter}
          agentFilter={agentFilter}
          loading={loadingTasks}
          error={tasksError}
          onStatusChange={setStatusFilter}
          onAgentChange={setAgentFilter}
        />
      </div>

      <div className={clsx(activeTab !== "stats" && "hidden")}>
        <RoutingStatsTable />
      </div>
    </div>
  );
}
