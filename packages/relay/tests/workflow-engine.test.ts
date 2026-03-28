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

  it("should execute parallel branches concurrently", async () => {
    const callOrder: string[] = [];
    (taskManager.createTask as ReturnType<typeof vi.fn>).mockImplementation(async (text: string) => {
      callOrder.push(`create:${text}`);
      return {
        id: `task-${text}`,
        status: "submitted",
        artifacts: [],
        history: [{ role: "user", parts: [{ type: "text", text }] }],
        metadata: { createdAt: "", updatedAt: "", assignedAgent: "", routingReason: "", latencyMs: 0 },
      };
    });
    (taskManager.executeTask as ReturnType<typeof vi.fn>).mockImplementation(async (taskId: string) => ({
      id: taskId,
      status: "completed",
      artifacts: [{ name: "output", parts: [{ type: "text", text: `done-${taskId}` }] }],
      history: [],
      metadata: { createdAt: "", updatedAt: "", assignedAgent: "mock", routingReason: "", latencyMs: 50 },
    }));

    const engine = createWorkflowEngine(db, taskManager, bus);
    // a -> b, a -> c, b -> d, c -> d (diamond)
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "a", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "A" } },
        { id: "b", type: "agent-task", label: "B", config: { agent: "auto", taskTemplate: "B" } },
        { id: "c", type: "agent-task", label: "C", config: { agent: "auto", taskTemplate: "C" } },
        { id: "d", type: "agent-task", label: "D", config: { agent: "auto", taskTemplate: "D" } },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
        { source: "b", target: "d" },
        { source: "c", target: "d" },
      ],
    };
    db.insertWorkflow("wf-d", "Diamond", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-d");

    expect(run.status).toBe("completed");
    // A must be first; B and C in any order; D last
    expect(callOrder[0]).toBe("create:A");
    expect(callOrder[3]).toBe("create:D");
    expect(taskManager.createTask).toHaveBeenCalledTimes(4);
  });

  it("should handle condition nodes — true branch proceeds", async () => {
    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "n1", type: "agent-task", label: "Analyze", config: { agent: "auto", taskTemplate: "analyze bug" } },
        { id: "cond", type: "condition", label: "Is completed?", config: { field: "n1.status", operator: "equals", value: "completed" } },
        { id: "n2", type: "agent-task", label: "Fix", config: { agent: "auto", taskTemplate: "fix it" } },
      ],
      edges: [
        { source: "n1", target: "cond" },
        { source: "cond", target: "n2" },
      ],
    };
    db.insertWorkflow("wf-cond", "Conditional", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-cond");

    expect(run.status).toBe("completed");
    expect(run.context["cond"].conditionResult).toBe(true);
    // n2 should have executed
    expect(run.context["n2"].status).toBe("completed");
  });

  it("should skip downstream nodes when condition is false", async () => {
    (taskManager.executeTask as ReturnType<typeof vi.fn>).mockImplementation(async (taskId: string) => ({
      id: taskId,
      status: "failed",
      artifacts: [],
      history: [],
      metadata: { createdAt: "", updatedAt: "", assignedAgent: "mock", routingReason: "", latencyMs: 100 },
    }));

    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "n1", type: "agent-task", label: "Analyze", config: { agent: "auto", taskTemplate: "analyze bug" } },
        { id: "cond", type: "condition", label: "Is completed?", config: { field: "n1.status", operator: "equals", value: "completed" } },
        { id: "n2", type: "agent-task", label: "Fix", config: { agent: "auto", taskTemplate: "fix it" } },
      ],
      edges: [
        { source: "n1", target: "cond" },
        { source: "cond", target: "n2" },
      ],
    };
    db.insertWorkflow("wf-cond-f", "Cond False", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-cond-f");

    expect(run.context["cond"].conditionResult).toBe(false);
    expect(run.context["n2"].status).toBe("skipped");
    // createTask should only be called once (for n1, not n2)
    expect(taskManager.createTask).toHaveBeenCalledTimes(1);
  });

  it("should resolve task templates using edge data mappings", async () => {
    let capturedTexts: string[] = [];
    (taskManager.createTask as ReturnType<typeof vi.fn>).mockImplementation(async (text: string) => {
      capturedTexts.push(text);
      return {
        id: `task-${capturedTexts.length}`,
        status: "submitted",
        artifacts: [],
        history: [{ role: "user", parts: [{ type: "text", text }] }],
        metadata: { createdAt: "", updatedAt: "", assignedAgent: "", routingReason: "", latencyMs: 0 },
      };
    });
    (taskManager.executeTask as ReturnType<typeof vi.fn>).mockImplementation(async (taskId: string) => ({
      id: taskId,
      status: "completed",
      artifacts: [{ name: "output", parts: [{ type: "text", text: "Bug is in auth module line 42" }] }],
      history: [],
      metadata: { createdAt: "", updatedAt: "", assignedAgent: "mock", routingReason: "", latencyMs: 50 },
    }));

    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "n1", type: "agent-task", label: "Analyze", config: { agent: "auto", taskTemplate: "analyze the bug" } },
        { id: "n2", type: "agent-task", label: "Fix", config: { agent: "auto", taskTemplate: "Fix this: {{bugReport}}" } },
      ],
      edges: [
        { source: "n1", target: "n2", dataMapping: { "artifacts[0].parts[0].text": "bugReport" } },
      ],
    };
    db.insertWorkflow("wf-map", "Mapped", definition as unknown as Record<string, unknown>);

    await engine.runWorkflow("wf-map");

    expect(capturedTexts[0]).toBe("analyze the bug");
    expect(capturedTexts[1]).toBe("Fix this: Bug is in auth module line 42");
  });

  it("should mark run as failed when a task throws", async () => {
    (taskManager.executeTask as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adapter crashed"));

    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [{ id: "n1", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "A" } }],
      edges: [],
    };
    db.insertWorkflow("wf-fail", "Fail", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-fail");

    expect(run.status).toBe("failed");
    expect(run.context["n1"].status).toBe("failed");
    expect(run.context["n1"].result).toContain("adapter crashed");

    const dbRun = db.getWorkflowRun(run.id);
    expect(dbRun!.status).toBe("failed");
  });

  it("should resolve template placeholders from initialContext on root nodes", async () => {
    let capturedTexts: string[] = [];
    (taskManager.createTask as ReturnType<typeof vi.fn>).mockImplementation(async (text: string) => {
      capturedTexts.push(text);
      return {
        id: `task-${capturedTexts.length}`,
        status: "submitted",
        artifacts: [],
        history: [{ role: "user", parts: [{ type: "text", text }] }],
        metadata: { createdAt: "", updatedAt: "", assignedAgent: "", routingReason: "", latencyMs: 0 },
      };
    });

    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "n1", type: "agent-task", label: "Triage", config: { agent: "auto", taskTemplate: "Triage this bug: {{userInput}}" } },
      ],
      edges: [],
    };
    db.insertWorkflow("wf-ctx", "With Context", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-ctx", { userInput: "hello from initial context" });

    expect(run.status).toBe("completed");
    expect(capturedTexts[0]).toBe("Triage this bug: hello from initial context");
  });

  it("should not override edge-mapped data with initialContext", async () => {
    let capturedTexts: string[] = [];
    (taskManager.createTask as ReturnType<typeof vi.fn>).mockImplementation(async (text: string) => {
      capturedTexts.push(text);
      return {
        id: `task-${capturedTexts.length}`,
        status: "submitted",
        artifacts: [],
        history: [{ role: "user", parts: [{ type: "text", text }] }],
        metadata: { createdAt: "", updatedAt: "", assignedAgent: "", routingReason: "", latencyMs: 0 },
      };
    });
    (taskManager.executeTask as ReturnType<typeof vi.fn>).mockImplementation(async (taskId: string) => ({
      id: taskId,
      status: "completed",
      artifacts: [{ name: "output", parts: [{ type: "text", text: "edge-provided value" }] }],
      history: [],
      metadata: { createdAt: "", updatedAt: "", assignedAgent: "mock", routingReason: "", latencyMs: 50 },
    }));

    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "n1", type: "agent-task", label: "Step 1", config: { agent: "auto", taskTemplate: "first step" } },
        { id: "n2", type: "agent-task", label: "Step 2", config: { agent: "auto", taskTemplate: "Got: {{report}}" } },
      ],
      edges: [
        { source: "n1", target: "n2", dataMapping: { "artifacts[0].parts[0].text": "report" } },
      ],
    };
    db.insertWorkflow("wf-ctx-nooverride", "No Override", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-ctx-nooverride", { report: "should be ignored" });

    expect(run.status).toBe("completed");
    // Edge-mapped data takes precedence over initialContext
    expect(capturedTexts[1]).toBe("Got: edge-provided value");
  });

  it("should route to explicit agent when config.agent is not auto", async () => {
    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [{ id: "n1", type: "agent-task", label: "A", config: { agent: "claude-code", taskTemplate: "fix it" } }],
      edges: [],
    };
    db.insertWorkflow("wf-explicit", "Explicit Agent", definition as unknown as Record<string, unknown>);

    await engine.runWorkflow("wf-explicit");

    expect(taskManager.createTask).toHaveBeenCalledWith("fix it", "claude-code");
  });
});
