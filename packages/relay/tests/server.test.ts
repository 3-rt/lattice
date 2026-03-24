import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/server.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import { createRegistry } from "../src/registry.js";
import { createRouter } from "../src/router.js";
import { createTaskManager } from "../src/task-manager.js";
import type { LatticeAdapter, AgentCard, Task } from "@lattice/adapter-base";

function createMockAdapter(name: string, skillTags: string[]): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "s1", name: "Skill", description: "A skill", tags: skillTags }],
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

describe("Server API", () => {
  let app: ReturnType<typeof createApp>;
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    const db = createDatabase(":memory:");
    const bus = createEventBus();
    registry = createRegistry(db, bus);
    const router = createRouter(registry);
    const taskManager = createTaskManager(db, bus, registry, router);
    app = createApp({ db, registry, taskManager, bus });
  });

  describe("GET /api/agents", () => {
    it("should return empty array when no agents", async () => {
      const res = await request(app).get("/api/agents");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("should return registered agents", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      const res = await request(app).get("/api/agents");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("claude-code");
    });

    it("should include statusReason when agent is offline", async () => {
      const adapter = createMockAdapter("claude-code", ["code"]);
      registry.register(adapter);
      const entry = registry.listAgents()[0];
      entry.status = "offline";
      entry.statusReason = "CLI not found";
      const res = await request(app).get("/api/agents");
      expect(res.body[0].statusReason).toBe("CLI not found");
    });

    it("should omit statusReason when agent is online", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      const res = await request(app).get("/api/agents");
      expect(res.body[0].statusReason).toBeUndefined();
    });
  });

  describe("POST /api/tasks", () => {
    it("should create a task", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      const res = await request(app)
        .post("/api/tasks")
        .send({ text: "fix the bug" });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe("submitted");
    });

    it("should create and execute a task", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      const res = await request(app)
        .post("/api/tasks")
        .send({ text: "fix the code", execute: true });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe("completed");
    });

    it("should route to explicit agent", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      registry.register(createMockAdapter("openclaw", ["messaging"]));
      const res = await request(app)
        .post("/api/tasks")
        .send({ text: "fix code", agent: "openclaw", execute: true });
      expect(res.status).toBe(201);
      expect(res.body.metadata.assignedAgent).toBe("openclaw");
    });
  });

  describe("GET /api/tasks", () => {
    it("should list tasks", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      await request(app).post("/api/tasks").send({ text: "task 1" });
      await request(app).post("/api/tasks").send({ text: "task 2" });
      const res = await request(app).get("/api/tasks");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe("GET /api/tasks/:id", () => {
    it("should return a task by id", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      const created = await request(app).post("/api/tasks").send({ text: "test" });
      const res = await request(app).get(`/api/tasks/${created.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
    });

    it("should return 404 for unknown task", async () => {
      const res = await request(app).get("/api/tasks/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/tasks/:id/cancel", () => {
    it("should cancel a task", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      const created = await request(app).post("/api/tasks").send({ text: "test" });
      const res = await request(app).post(`/api/tasks/${created.body.id}/cancel`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe("canceled");
    });
  });

  describe("GET /api/routing/stats", () => {
    it("should return routing stats", async () => {
      const res = await request(app).get("/api/routing/stats");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
