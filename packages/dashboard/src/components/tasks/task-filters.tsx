interface TaskFiltersProps {
  agents: string[];
  statusFilter: string;
  agentFilter: string;
  onStatusChange: (status: string) => void;
  onAgentChange: (agent: string) => void;
}

const STATUSES = [
  "submitted",
  "working",
  "completed",
  "failed",
  "canceled",
  "input-required",
];

export function TaskFilters({
  agents,
  statusFilter,
  agentFilter,
  onStatusChange,
  onAgentChange,
}: TaskFiltersProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <select
        value={statusFilter}
        onChange={(event) => onStatusChange(event.target.value)}
        className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 focus:border-lattice-600 focus:outline-none"
      >
        <option value="">All statuses</option>
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>

      <select
        value={agentFilter}
        onChange={(event) => onAgentChange(event.target.value)}
        className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 focus:border-lattice-600 focus:outline-none"
      >
        <option value="">All agents</option>
        {agents.map((agent) => (
          <option key={agent} value={agent}>
            {agent}
          </option>
        ))}
      </select>
    </div>
  );
}
