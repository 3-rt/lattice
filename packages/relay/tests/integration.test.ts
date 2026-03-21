import { describe, it, expect, vi, afterEach } from "vitest";
import http from "http";
import { createApp } from "../src/server.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import { createRegistry } from "../src/registry.js";
import { createRouter } from "../src/router.js";
import { createTaskManager } from "../src/task-manager.js";
import type { LatticeAdapter, AgentCard, Task } from "@lattice/adapter-base";

function createMockAdapter(name: string): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Integration test ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: true, pushNotifications: false },
    skills: [
      { id: "coding", name: "Coding", description: "Write code", tags: ["code", "debug", "fix"] },
    ],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn().mockImplementation(async (task: Task): Promise<Task> => ({
      ...task,
      status: "completed",
      artifacts: [{ name: "fix", parts: [{ type: "text", text: "Bug fixed in auth.ts line 42" }] }],
    })),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("Integration: full task lifecycle", () => {
  let server: http.Server;
  let baseUrl: string;

  afterEach(() => {
    server?.close();
  });

  it("should register an agent, create a task, execute it, and receive SSE events", async () => {
    const db = createDatabase(":memory:");
    const bus = createEventBus();
    const registry = createRegistry(db, bus);
    const router = createRouter(registry);
    const taskManager = createTaskManager(db, bus, registry, router);
    const app = createApp({ db, registry, taskManager, bus });

    registry.register(createMockAdapter("claude-code"));

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });

    // Verify agent is listed
    const agentsRes = await fetch(`${baseUrl}/api/agents`);
    const agents = await agentsRes.json();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("claude-code");

    // Create and execute a task
    const taskRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "fix the bug in auth.ts", execute: true }),
    });
    const task = await taskRes.json();

    expect(task.status).toBe("completed");
    expect(task.metadata.assignedAgent).toBe("claude-code");
    expect(task.artifacts).toHaveLength(1);
    expect(task.artifacts[0].parts[0].text).toContain("Bug fixed");

    // Verify task appears in history
    const historyRes = await fetch(`${baseUrl}/api/tasks`);
    const history = await historyRes.json();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(task.id);

    // Verify SSE buffer has events
    const events = bus.getBufferedEvents();
    const eventTypes = events.map((e) => e.event.type);
    expect(eventTypes).toContain("agent:registered");
    expect(eventTypes).toContain("task:created");
    expect(eventTypes).toContain("task:routed");
    expect(eventTypes).toContain("task:completed");
  });
});

describe("Learned Router Integration", () => {
  function createMockAdapterWithTags(name: string, skillTags: string[]): LatticeAdapter {
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
      executeTask: vi.fn(),
      streamTask: vi.fn(),
      healthCheck: vi.fn().mockResolvedValue(true),
    };
  }

  it("should route tasks through the learned router end-to-end", async () => {
    const db = createDatabase(":memory:");
    const bus = createEventBus();
    const registry = createRegistry(db, bus);

    // Register two agents
    const goodAdapter = createMockAdapterWithTags("good-agent", ["code"]);
    (goodAdapter.executeTask as any).mockResolvedValue({
      id: "t1",
      status: "completed",
      artifacts: [{ name: "result", parts: [{ type: "text", text: "done" }] }],
      history: [],
    });
    const badAdapter = createMockAdapterWithTags("bad-agent", ["code"]);
    (badAdapter.executeTask as any).mockRejectedValue(new Error("I always fail"));

    registry.register(goodAdapter);
    registry.register(badAdapter);

    // Use learned router
    const { createRouterFromConfig } = await import("../src/router.js");
    const router = createRouterFromConfig(registry, db, { strategy: "learned" });
    const taskManager = createTaskManager(db, bus, registry, router);

    // Run several debugging tasks — after some learning, good-agent should dominate
    const results: string[] = [];
    for (let i = 0; i < 20; i++) {
      const task = await taskManager.createTask("fix the bug in module");
      const completed = await taskManager.executeTask(task.id);
      results.push(completed.metadata?.assignedAgent ?? "");
    }

    // Check that stats were recorded per category
    const stats = db.getRoutingStats();
    const debuggingStats = stats.filter((s) => s.category === "debugging");
    expect(debuggingStats.length).toBeGreaterThan(0);

    // The good agent should have accumulated successes
    const goodStats = debuggingStats.find((s) => s.agent_name === "good-agent");
    expect(goodStats).toBeDefined();
    expect(goodStats!.successes).toBeGreaterThan(0);

    db.close();
  });
});
