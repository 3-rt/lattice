import { useEffect } from "react";
import { useLatticeStore } from "../store/lattice-store.ts";
import { useFlowEvents } from "../hooks/use-flow-events.ts";
import { FlowCanvas } from "../components/flow/flow-canvas.tsx";
import { TaskLogPanel } from "../components/flow/task-log-panel.tsx";
import { TaskDispatchBar } from "../components/tasks/task-dispatch-bar.tsx";
import { fetchAgents, fetchTasks } from "../lib/api.ts";

export function LiveFlow() {
  const setAgents = useLatticeStore((s) => s.setAgents);
  const setTasks = useLatticeStore((s) => s.setTasks);

  // Load initial data
  useEffect(() => {
    fetchAgents()
      .then((agents) => setAgents(agents))
      .catch((err) => console.error("Failed to fetch agents:", err));
    fetchTasks()
      .then((tasks) => setTasks(tasks))
      .catch((err) => console.error("Failed to fetch tasks:", err));
  }, [setAgents, setTasks]);

  // Activate flow event processing
  useFlowEvents();

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="surface-panel-strong shrink-0 overflow-hidden px-5 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="page-header-eyebrow">Mission control</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-[var(--text-strong)]">
              Watch the relay, agents, and active work in one place.
            </h1>
            <p className="mt-3 text-sm leading-6 text-[var(--text-muted)]">
              Live Flow is the high-signal view for orchestration. Use it when
              you need immediate awareness of task routing, agent activity, and
              system health.
            </p>
          </div>
          <div className="w-full max-w-3xl">
            <TaskDispatchBar />
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex-1 min-w-0">
          <FlowCanvas />
        </div>
        <TaskLogPanel />
      </div>
    </div>
  );
}
