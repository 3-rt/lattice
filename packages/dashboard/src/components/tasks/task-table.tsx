import { useLatticeStore } from "../../store/lattice-store.ts";
import { filterTasks } from "./task-utils.ts";
import { TaskFilters } from "./task-filters.tsx";
import { TaskRow } from "./task-row.tsx";

interface TaskTableProps {
  statusFilter: string;
  agentFilter: string;
  loading: boolean;
  error: string | null;
  onStatusChange: (status: string) => void;
  onAgentChange: (agent: string) => void;
}

export function TaskTable({
  statusFilter,
  agentFilter,
  loading,
  error,
  onStatusChange,
  onAgentChange,
}: TaskTableProps) {
  const tasks = useLatticeStore((state) => state.tasks);

  const filteredTasks = filterTasks(tasks, statusFilter, agentFilter);
  const knownAgents = Array.from(
    new Set(
      tasks
        .map((task) => task.metadata?.assignedAgent)
        .filter((agent): agent is string => Boolean(agent))
    )
  ).sort((left, right) => left.localeCompare(right));

  return (
    <div className="space-y-3">
      <TaskFilters
        agents={knownAgents}
        statusFilter={statusFilter}
        agentFilter={agentFilter}
        onStatusChange={onStatusChange}
        onAgentChange={onAgentChange}
      />

      <div className="rounded-lg border border-gray-800 bg-gray-900/50">
        <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">
          <span className="w-3.5" />
          <span className="w-28 shrink-0">Status</span>
          <span className="w-36 shrink-0">Agent</span>
          <span className="flex-1">Task</span>
          <span className="w-20 shrink-0 text-right">Latency</span>
          <span className="w-20 shrink-0 text-right">Time</span>
        </div>

        {loading && tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-gray-500">Loading tasks...</p>
          </div>
        ) : error && tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-red-400">Failed to load tasks</p>
            <p className="mt-1 text-xs text-gray-600">{error}</p>
          </div>
        ) : filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-gray-500">No tasks found</p>
            <p className="mt-1 text-xs text-gray-600">
              Dispatch a task from the Agent Overview page to see it here
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => <TaskRow key={task.id} task={task} />)
        )}
      </div>

      {error && tasks.length > 0 && (
        <p className="text-xs text-red-400">Refresh failed: {error}</p>
      )}
    </div>
  );
}
