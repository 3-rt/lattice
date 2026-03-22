import { beforeEach, describe, expect, it } from "vitest";
import type { TaskInfo } from "../lib/api.ts";
import { useLatticeStore } from "./lattice-store.ts";
import { useWorkflowStore } from "./workflow-store.ts";

function makeTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    id: "task-1",
    status: "submitted",
    artifacts: [],
    history: [
      {
        role: "user",
        parts: [{ type: "text", text: "Fix the auth bug" }],
      },
    ],
    metadata: {
      createdAt: "2026-03-21T12:00:00.000Z",
      updatedAt: "2026-03-21T12:00:00.000Z",
      assignedAgent: "",
      routingReason: "",
      latencyMs: 0,
    },
    ...overrides,
  };
}

describe("LatticeStore", () => {
  beforeEach(() => {
    useLatticeStore.setState({
      agents: [],
      tasks: [],
      connectionStatus: "disconnected",
    });
    useWorkflowStore.setState({
      workflows: [
        {
          id: "wf-1",
          name: "Workflow",
          definition: { nodes: [{ id: "step-1", type: "agent-task", label: "Step", config: { agent: "auto", taskTemplate: "Do it" } }], edges: [] },
          createdAt: "2026-03-21T12:00:00.000Z",
        },
      ],
      activeTab: "editor",
      editorNodes: [],
      editorEdges: [],
      selectedNodeId: null,
      editingWorkflowId: null,
      workflowName: "",
      selectedWorkflowId: "wf-1",
      activeRunId: null,
      activeRunStatus: "idle",
      stepStatuses: new Map(),
      runs: [],
    });
  });

  it("replaces tasks when setTasks is called", () => {
    const taskA = makeTask({ id: "task-a" });
    const taskB = makeTask({ id: "task-b", status: "completed" });

    useLatticeStore.getState().setTasks([taskA, taskB]);

    expect(useLatticeStore.getState().tasks).toEqual([taskA, taskB]);
  });

  it("updates task metadata when a task is routed", () => {
    const task = makeTask();
    useLatticeStore.getState().setTasks([task]);

    useLatticeStore.getState().handleSSEEvent({
      type: "task:routed",
      taskId: task.id,
      agentName: "claude-code",
      reason: "historically strongest on coding tasks",
    });

    expect(useLatticeStore.getState().tasks).toEqual([
      expect.objectContaining({
        id: task.id,
        status: "working",
        metadata: expect.objectContaining({
          assignedAgent: "claude-code",
          routingReason: "historically strongest on coding tasks",
          createdAt: task.metadata.createdAt,
        }),
      }),
    ]);
  });

  it("forwards workflow events into the workflow store", () => {
    const store = useLatticeStore.getState();

    store.handleSSEEvent({
      type: "workflow:started",
      runId: "run-1",
      workflowId: "wf-1",
    });
    store.handleSSEEvent({
      type: "workflow:step",
      runId: "run-1",
      stepId: "step-1",
      status: "completed",
    });
    store.handleSSEEvent({
      type: "workflow:completed",
      runId: "run-1",
    });

    const workflowState = useWorkflowStore.getState();
    expect(workflowState.activeRunId).toBe("run-1");
    expect(workflowState.stepStatuses.get("step-1")).toEqual({
      stepId: "step-1",
      status: "completed",
    });
    expect(workflowState.activeRunStatus).toBe("completed");
  });
});
