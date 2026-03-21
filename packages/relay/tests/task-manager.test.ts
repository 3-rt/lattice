import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTaskManager } from "../src/task-manager.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import { createRegistry } from "../src/registry.js";
import { createRouter } from "../src/router.js";
import type { LatticeAdapter, AgentCard, Task } from "@lattice/adapter-base";

function createMockAdapter(name: string, skillTags: string[]): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "skill-1", name: "Skill", description: "A skill", tags: skillTags }],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn().mockImplementation(async (task: Task): Promise<Task> => ({
      ...task,
      status: "completed",
      artifacts: [{ name: "result", parts: [{ type: "text", text: "done" }] }],
    })),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("TaskManager", () => {
  let taskManager: ReturnType<typeof createTaskManager>;
  let bus: ReturnType<typeof createEventBus>;
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    const db = createDatabase(":memory:");
    bus = createEventBus();
    registry = createRegistry(db, bus);
    const router = createRouter(registry);
    taskManager = createTaskManager(db, bus, registry, router);
  });

  it("should create a task and emit task:created", async () => {
    const handler = vi.fn();
    bus.on("task:created", handler);
    registry.register(createMockAdapter("claude-code", ["code"]));
    const task = await taskManager.createTask("fix the code bug");
    expect(task.id).toBeDefined();
    expect(task.status).toBe("submitted");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("should execute a task through the full lifecycle", async () => {
    const routedHandler = vi.fn();
    const completedHandler = vi.fn();
    bus.on("task:routed", routedHandler);
    bus.on("task:completed", completedHandler);
    registry.register(createMockAdapter("claude-code", ["code"]));
    const task = await taskManager.createTask("fix the code bug");
    const result = await taskManager.executeTask(task.id);
    expect(result.status).toBe("completed");
    expect(result.artifacts).toHaveLength(1);
    expect(routedHandler).toHaveBeenCalledOnce();
    expect(completedHandler).toHaveBeenCalledOnce();
  });

  it("should handle adapter failure gracefully", async () => {
    const failHandler = vi.fn();
    bus.on("task:failed", failHandler);
    const adapter = createMockAdapter("bad-agent", ["code"]);
    (adapter.executeTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    registry.register(adapter);
    const task = await taskManager.createTask("fix code");
    const result = await taskManager.executeTask(task.id);
    expect(result.status).toBe("failed");
    expect(failHandler).toHaveBeenCalledOnce();
  });

  it("should route to explicit agent when specified", async () => {
    registry.register(createMockAdapter("claude-code", ["code"]));
    registry.register(createMockAdapter("openclaw", ["messaging"]));
    const task = await taskManager.createTask("fix code", "openclaw");
    const result = await taskManager.executeTask(task.id);
    expect(result.metadata.assignedAgent).toBe("openclaw");
  });

  it("should get task by id", async () => {
    registry.register(createMockAdapter("claude-code", ["code"]));
    const task = await taskManager.createTask("fix code");
    const retrieved = taskManager.getTask(task.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(task.id);
  });

  it("should list tasks", async () => {
    registry.register(createMockAdapter("claude-code", ["code"]));
    await taskManager.createTask("task 1");
    await taskManager.createTask("task 2");
    const tasks = taskManager.listTasks();
    expect(tasks).toHaveLength(2);
  });

  it("should cancel a task", async () => {
    const cancelHandler = vi.fn();
    bus.on("task:canceled", cancelHandler);
    registry.register(createMockAdapter("claude-code", ["code"]));
    const task = await taskManager.createTask("fix code");
    taskManager.cancelTask(task.id);
    const updated = taskManager.getTask(task.id);
    expect(updated!.status).toBe("canceled");
    expect(cancelHandler).toHaveBeenCalledOnce();
  });
});
