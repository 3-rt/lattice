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
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-100">Tasks & Routing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Task history, agent performance, and routing convergence
        </p>
      </div>

      <div className="flex gap-1 border-b border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              activeTab === tab.id
                ? "border-lattice-500 text-gray-100"
                : "border-transparent text-gray-500 hover:text-gray-300"
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
