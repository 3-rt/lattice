import { create } from "zustand";
import type { AgentInfo, TaskInfo } from "../lib/api.ts";
import { useWorkflowStore } from "./workflow-store.ts";

interface LatticeState {
  // Data
  agents: AgentInfo[];
  tasks: TaskInfo[];
  connectionStatus: "connecting" | "connected" | "disconnected";

  // Actions
  setAgents: (agents: AgentInfo[]) => void;
  setTasks: (tasks: TaskInfo[]) => void;
  updateAgent: (name: string, update: Partial<AgentInfo>) => void;
  addTask: (task: TaskInfo) => void;
  updateTask: (taskId: string, update: Partial<TaskInfo>) => void;
  setConnectionStatus: (status: LatticeState["connectionStatus"]) => void;

  // SSE event handlers
  handleSSEEvent: (event: { type: string; [key: string]: unknown }) => void;
}

export const useLatticeStore = create<LatticeState>((set, get) => ({
  agents: [],
  tasks: [],
  connectionStatus: "disconnected",

  setAgents: (agents) => set({ agents }),
  setTasks: (tasks) => set({ tasks }),

  updateAgent: (name, update) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.name === name ? { ...a, ...update } : a)),
    })),

  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks],
    })),

  updateTask: (taskId, update) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...update } : t)),
    })),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  handleSSEEvent: (event) => {
    const state = get();
    switch (event.type) {
      case "agent:registered":
        set({
          agents: [
            ...state.agents.filter((a) => a.name !== (event.agent as AgentInfo["card"]).name),
            { name: (event.agent as AgentInfo["card"]).name, status: "online", card: event.agent as AgentInfo["card"] },
          ],
        });
        break;

      case "agent:deregistered":
        set({ agents: state.agents.filter((a) => a.name !== event.agentName) });
        break;

      case "agent:status":
        state.updateAgent(event.agentName as string, { status: event.status as string });
        break;

      case "task:created":
        state.addTask(event.task as TaskInfo);
        break;

      case "task:completed":
      case "task:failed":
      case "task:canceled":
        if (event.task) {
          state.updateTask((event.task as TaskInfo).id, event.task as Partial<TaskInfo>);
        } else if (event.taskId) {
          state.updateTask(event.taskId as string, {
            status: event.type.split(":")[1],
          });
        }
        break;

      case "task:routed":
        const existingTask = state.tasks.find((t) => t.id === event.taskId);
        const metadata = existingTask?.metadata ?? {
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          assignedAgent: "",
          routingReason: "",
          latencyMs: 0,
        };
        state.updateTask(event.taskId as string, {
          status: "working",
          metadata: {
            ...metadata,
            assignedAgent: event.agentName as string,
            routingReason: event.reason as string,
          },
        });
        break;

      case "workflow:started":
        useWorkflowStore
          .getState()
          .startRun(event.runId as string, event.workflowId as string);
        break;

      case "workflow:step":
        useWorkflowStore.getState().updateStepStatus(
          event.stepId as string,
          event.status as "working" | "completed" | "failed" | "skipped"
        );
        break;

      case "workflow:completed":
        useWorkflowStore.getState().completeRun();
        break;
    }
  },
}));
