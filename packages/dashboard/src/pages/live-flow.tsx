import { useEffect } from "react";
import { useLatticeStore } from "../store/lattice-store.ts";
import { useFlowEvents } from "../hooks/use-flow-events.ts";
import { FlowCanvas } from "../components/flow/flow-canvas.tsx";
import { TaskLogPanel } from "../components/flow/task-log-panel.tsx";
import { TaskDispatchBar } from "../components/tasks/task-dispatch-bar.tsx";
import { fetchAgents, fetchTasks } from "../lib/api.ts";

export function LiveFlow() {
  const setAgents = useLatticeStore((s) => s.setAgents);

  // Load initial data
  useEffect(() => {
    fetchAgents()
      .then((agents) => setAgents(agents))
      .catch((err) => console.error("Failed to fetch agents:", err));
    fetchTasks()
      .then(() => {}) // tasks are added via SSE
      .catch((err) => console.error("Failed to fetch tasks:", err));
  }, [setAgents]);

  // Activate flow event processing
  useFlowEvents();

  return (
    <div className="flex h-full flex-col">
      {/* Top bar with dispatch */}
      <div className="shrink-0 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-sm font-semibold text-gray-100">Live Flow</h1>
            <p className="text-[10px] text-gray-500">
              Real-time agent orchestration view
            </p>
          </div>
          <div className="flex-1 max-w-xl">
            <TaskDispatchBar />
          </div>
        </div>
      </div>

      {/* Canvas + side panel */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          <FlowCanvas />
        </div>
        <TaskLogPanel />
      </div>
    </div>
  );
}
