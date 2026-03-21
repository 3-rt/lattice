import { TaskDispatchBar } from "../components/tasks/task-dispatch-bar.tsx";
import { AgentGrid } from "../components/agents/agent-grid.tsx";

export function AgentOverview() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-100">Agent Overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Registered agents and their current status
        </p>
      </div>

      <TaskDispatchBar />

      <AgentGrid />
    </div>
  );
}
