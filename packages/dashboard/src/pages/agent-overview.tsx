import { TaskDispatchBar } from "../components/tasks/task-dispatch-bar.tsx";
import { AgentGrid } from "../components/agents/agent-grid.tsx";

export function AgentOverview() {
  return (
    <div className="space-y-8">
      <div className="page-header">
        <p className="page-header-eyebrow">Operator overview</p>
        <h1 className="page-title">Coordinate agent work with confidence.</h1>
        <p className="page-description">
          Dispatch tasks, check which agents are ready, and understand what each
          adapter can handle before you build larger workflows.
        </p>
      </div>

      <TaskDispatchBar />

      <AgentGrid />
    </div>
  );
}
