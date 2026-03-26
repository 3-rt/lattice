import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/server.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import { createRegistry } from "../src/registry.js";
import { createRouter } from "../src/router.js";
import { createTaskManager } from "../src/task-manager.js";
import { createWorkflowEngine } from "../src/workflow-engine.js";
import type { LatticeAdapter, AgentCard, Task } from "@lattice/adapter-base";

function createMockAdapter(name: string): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "s1", name: "Skill", description: "skill", tags: ["code"] }],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn().mockImplementation(async (task: Task) => ({
      ...task,
      status: "completed",
      artifacts: [{ name: "output", parts: [{ type: "text", text: "done" }] }],
    })),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("Workflow API", () => {
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    db = createDatabase(":memory:");
    const bus = createEventBus();
    const registry = createRegistry(db, bus);
    const router = createRouter(registry);
    const taskManager = createTaskManager(db, bus, registry, router);
    const workflowEngine = createWorkflowEngine(db, taskManager, bus);
    registry.register(createMockAdapter("claude-code"));
    app = createApp({ db, registry, taskManager, bus, workflowEngine });
  });

  it("POST /api/workflows — should create a workflow", async () => {
    const res = await request(app)
      .post("/api/workflows")
      .send({
        name: "Test Workflow",
        definition: {
          nodes: [{ id: "n1", type: "agent-task", label: "Step 1", config: { agent: "auto", taskTemplate: "do it" } }],
          edges: [],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Test Workflow");
  });

  it("GET /api/workflows — should list workflows", async () => {
    await request(app).post("/api/workflows").send({
      name: "WF1",
      definition: { nodes: [], edges: [] },
    });
    await request(app).post("/api/workflows").send({
      name: "WF2",
      definition: { nodes: [], edges: [] },
    });

    const res = await request(app).get("/api/workflows");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("POST /api/workflows/:id/run — should run a workflow and return run result", async () => {
    const createRes = await request(app).post("/api/workflows").send({
      name: "Runnable",
      definition: {
        nodes: [{ id: "n1", type: "agent-task", label: "Step", config: { agent: "auto", taskTemplate: "fix the code" } }],
        edges: [],
      },
    });
    const workflowId = createRes.body.id;

    const runRes = await request(app).post(`/api/workflows/${workflowId}/run`);
    expect(runRes.status).toBe(200);
    expect(runRes.body.status).toBe("completed");
    expect(runRes.body.workflowId).toBe(workflowId);
  });

  it("GET /api/workflows/:id/runs — should list runs for a workflow", async () => {
    const createRes = await request(app).post("/api/workflows").send({
      name: "Multi-run",
      definition: {
        nodes: [{ id: "n1", type: "agent-task", label: "Step", config: { agent: "auto", taskTemplate: "do" } }],
        edges: [],
      },
    });
    const workflowId = createRes.body.id;

    await request(app).post(`/api/workflows/${workflowId}/run`);
    await request(app).post(`/api/workflows/${workflowId}/run`);

    const runsRes = await request(app).get(`/api/workflows/${workflowId}/runs`);
    expect(runsRes.status).toBe(200);
    expect(runsRes.body).toHaveLength(2);
  });

  it("POST /api/workflows — should return 400 without name", async () => {
    const res = await request(app).post("/api/workflows").send({ definition: { nodes: [], edges: [] } });
    expect(res.status).toBe(400);
  });

  it("POST /api/workflows — should return 400 without definition", async () => {
    const res = await request(app).post("/api/workflows").send({ name: "No Def" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it("POST /api/workflows — should return 400 if definition missing nodes", async () => {
    const res = await request(app).post("/api/workflows").send({ name: "Bad", definition: { edges: [] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/nodes/);
  });

  it("POST /api/workflows — should return 400 if definition missing edges", async () => {
    const res = await request(app).post("/api/workflows").send({ name: "Bad", definition: { nodes: [] } });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/edges/);
  });

  it("POST /api/workflows — should return 400 if node missing id", async () => {
    const res = await request(app).post("/api/workflows").send({
      name: "Bad",
      definition: { nodes: [{ type: "agent-task", label: "x", config: {} }], edges: [] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/id/);
  });

  it("POST /api/workflows — should return 400 if node has invalid type", async () => {
    const res = await request(app).post("/api/workflows").send({
      name: "Bad",
      definition: { nodes: [{ id: "n1", type: "unknown", label: "x", config: {} }], edges: [] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/type/);
  });

  it("POST /api/workflows — should return 400 if edge references unknown node", async () => {
    const res = await request(app).post("/api/workflows").send({
      name: "Bad",
      definition: {
        nodes: [{ id: "n1", type: "agent-task", label: "x", config: { agent: "auto", taskTemplate: "do it" } }],
        edges: [{ source: "n1", target: "n99" }],
      },
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/n99/);
  });

  it("POST /api/workflows/:id/run — should return 404 for missing workflow", async () => {
    const res = await request(app).post("/api/workflows/nonexistent/run");
    expect(res.status).toBe(404);
  });
});
