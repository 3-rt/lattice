import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWorkflowEngine } from "../src/workflow-engine.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import type { LatticeDB } from "../src/db.js";
import type { LatticeEventBus } from "../src/event-bus.js";
import type { LatticeTaskManager } from "../src/task-manager.js";
import type { Task } from "@lattice/adapter-base";
import type { WorkflowDefinition } from "../src/workflow-types.js";

function createMockTaskManager(): LatticeTaskManager {
  let taskCounter = 0;
  return {
    createTask: vi.fn().mockImplementation(async (text: string): Promise<Task> => {
      taskCounter++;
      return {
        id: `task-${taskCounter}`,
        status: "submitted",
        artifacts: [],
        history: [{ role: "user", parts: [{ type: "text", text }] }],
        metadata: { createdAt: "", updatedAt: "", assignedAgent: "", routingReason: "", latencyMs: 0 },
      };
    }),
    executeTask: vi.fn().mockImplementation(async (taskId: string): Promise<Task> => ({
      id: taskId,
      status: "completed",
      artifacts: [{ name: "output", parts: [{ type: "text", text: `result from ${taskId}` }] }],
      history: [],
      metadata: { createdAt: "", updatedAt: "", assignedAgent: "mock-agent", routingReason: "", latencyMs: 100 },
    })),
    getTask: vi.fn(),
    listTasks: vi.fn().mockReturnValue([]),
    cancelTask: vi.fn(),
    provideInput: vi.fn(),
  };
}

describe("WorkflowEngine", () => {
  let db: LatticeDB;
  let bus: LatticeEventBus;
  let taskManager: LatticeTaskManager;

  beforeEach(() => {
    db = createDatabase(":memory:");
    bus = createEventBus();
    taskManager = createMockTaskManager();
  });

  it("should execute a single-node workflow", async () => {
    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [{ id: "n1", type: "agent-task", label: "Step 1", config: { agent: "auto", taskTemplate: "do the thing" } }],
      edges: [],
    };
    db.insertWorkflow("wf-1", "Single Step", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-1");

    expect(run.status).toBe("completed");
    expect(taskManager.createTask).toHaveBeenCalledOnce();
    expect(taskManager.executeTask).toHaveBeenCalledOnce();
  });

  it("should execute a linear chain in order", async () => {
    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "n1", type: "agent-task", label: "Step 1", config: { agent: "auto", taskTemplate: "first" } },
        { id: "n2", type: "agent-task", label: "Step 2", config: { agent: "auto", taskTemplate: "second" } },
        { id: "n3", type: "agent-task", label: "Step 3", config: { agent: "auto", taskTemplate: "third" } },
      ],
      edges: [
        { source: "n1", target: "n2" },
        { source: "n2", target: "n3" },
      ],
    };
    db.insertWorkflow("wf-2", "Chain", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-2");

    expect(run.status).toBe("completed");
    expect(taskManager.createTask).toHaveBeenCalledTimes(3);
    // Verify order via call sequence
    const createCalls = (taskManager.createTask as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls[0][0]).toBe("first");
    expect(createCalls[1][0]).toBe("second");
    expect(createCalls[2][0]).toBe("third");
  });

  it("should emit workflow:started and workflow:completed events", async () => {
    const startedHandler = vi.fn();
    const completedHandler = vi.fn();
    bus.on("workflow:started", startedHandler);
    bus.on("workflow:completed", completedHandler);

    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [{ id: "n1", type: "agent-task", label: "Step 1", config: { agent: "auto", taskTemplate: "do it" } }],
      edges: [],
    };
    db.insertWorkflow("wf-1", "Test", definition as unknown as Record<string, unknown>);

    await engine.runWorkflow("wf-1");

    expect(startedHandler).toHaveBeenCalledOnce();
    expect(completedHandler).toHaveBeenCalledOnce();
  });

  it("should emit workflow:step events for each node", async () => {
    const stepHandler = vi.fn();
    bus.on("workflow:step", stepHandler);

    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "n1", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "A" } },
        { id: "n2", type: "agent-task", label: "B", config: { agent: "auto", taskTemplate: "B" } },
      ],
      edges: [{ source: "n1", target: "n2" }],
    };
    db.insertWorkflow("wf-1", "Test", definition as unknown as Record<string, unknown>);

    await engine.runWorkflow("wf-1");

    // Each node emits two step events: "working" and "completed"
    expect(stepHandler).toHaveBeenCalledTimes(4);
  });

  it("should persist workflow run in database", async () => {
    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [{ id: "n1", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "A" } }],
      edges: [],
    };
    db.insertWorkflow("wf-1", "Test", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-1");

    const dbRun = db.getWorkflowRun(run.id);
    expect(dbRun).toBeDefined();
    expect(dbRun!.status).toBe("completed");
    expect(dbRun!.completed_at).toBeDefined();
  });

  it("should throw for non-existent workflow", async () => {
    const engine = createWorkflowEngine(db, taskManager, bus);
    await expect(engine.runWorkflow("nonexistent")).rejects.toThrow("Workflow \"nonexistent\" not found");
  });
});
