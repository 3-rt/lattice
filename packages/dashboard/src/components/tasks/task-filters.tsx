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
    <div className="flex flex-wrap gap-3">
      <select
        value={statusFilter}
        onChange={(event) => onStatusChange(event.target.value)}
        className="ui-select w-full sm:w-52"
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
        className="ui-select w-full sm:w-52"
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
