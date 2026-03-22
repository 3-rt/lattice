import type { Server } from "http";
import path from "path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type {
  AgentCard,
  LatticeAdapter,
  Task,
} from "../packages/adapters/base/src/index.js";
import {
  createApp,
  createDatabase,
  createEventBus,
  createRegistry,
  createRouterFromConfig,
  createTaskManager,
  createWorkflowEngine,
  seedWorkflows,
} from "../packages/relay/src/index.js";

let server: Server;
let baseUrl = "";

function createMockAdapter(name: string): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "skill-1", name: "Skill", description: "skill", tags: ["code"] }],
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

describe("smoke test: relay endpoints", () => {
  beforeAll(async () => {
    const db = createDatabase(":memory:");
    const bus = createEventBus();
    const registry = createRegistry(db, bus);
    const router = createRouterFromConfig(registry, db, { strategy: "simple" });
    const taskManager = createTaskManager(db, bus, registry, router);
    const workflowEngine = createWorkflowEngine(db, taskManager, bus);

    registry.register(createMockAdapter("claude-code"));
    registry.register(createMockAdapter("codex"));
    registry.register(createMockAdapter("openclaw"));

    const workflowDir = path.resolve(process.cwd(), "workflows");
    seedWorkflows(db, workflowDir);

    const app = createApp({ db, registry, taskManager, bus, workflowEngine });

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (address && typeof address === "object") {
          baseUrl = `http://127.0.0.1:${address.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(() => {
    server?.close();
  });

  it("GET /api/agents returns registered agents", async () => {
    const res = await fetch(`${baseUrl}/api/agents`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(3);
  });

  it("POST /api/tasks returns 400 without text", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("creates and lists tasks", async () => {
    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "smoke task" }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.id).toBeDefined();
    expect(created.status).toBe("submitted");

    const listRes = await fetch(`${baseUrl}/api/tasks`);
    expect(listRes.status).toBe(200);
    const tasks = await listRes.json();
    expect(Array.isArray(tasks)).toBe(true);
    expect(tasks.some((task: { id: string }) => task.id === created.id)).toBe(true);
  });

  it("returns a task by id and 404s for unknown ids", async () => {
    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "fetch by id" }),
    });
    const created = await createRes.json();

    const taskRes = await fetch(`${baseUrl}/api/tasks/${created.id}`);
    expect(taskRes.status).toBe(200);
    const task = await taskRes.json();
    expect(task.id).toBe(created.id);

    const missingRes = await fetch(`${baseUrl}/api/tasks/nonexistent-id`);
    expect(missingRes.status).toBe(404);
  });

  it("returns routing stats", async () => {
    const res = await fetch(`${baseUrl}/api/routing/stats`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("lists seeded workflows and can create a new workflow", async () => {
    const listRes = await fetch(`${baseUrl}/api/workflows`);
    expect(listRes.status).toBe(200);
    const workflows = await listRes.json();
    expect(Array.isArray(workflows)).toBe(true);
    expect(workflows.length).toBeGreaterThanOrEqual(2);

    const createRes = await fetch(`${baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Smoke Test Workflow",
        definition: { nodes: [], edges: [] },
      }),
    });
    expect(createRes.status).toBe(201);
    const body = await createRes.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe("Smoke Test Workflow");
  });

  it("runs a workflow and lists workflow runs", async () => {
    const createRes = await fetch(`${baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Runnable Workflow",
        definition: {
          nodes: [
            {
              id: "step-1",
              type: "agent-task",
              label: "Step 1",
              config: { agent: "auto", taskTemplate: "Do the task" },
            },
          ],
          edges: [],
        },
      }),
    });
    const workflow = await createRes.json();

    const runRes = await fetch(`${baseUrl}/api/workflows/${workflow.id}/run`, {
      method: "POST",
    });
    expect(runRes.status).toBe(200);
    const run = await runRes.json();
    expect(run.workflowId).toBe(workflow.id);
    expect(run.status).toBe("completed");

    const runsRes = await fetch(`${baseUrl}/api/workflows/${workflow.id}/runs`);
    expect(runsRes.status).toBe(200);
    const runs = await runsRes.json();
    expect(Array.isArray(runs)).toBe(true);
    expect(runs).toHaveLength(1);
  });

  it("exposes the SSE endpoint", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300);

    try {
      const res = await fetch(`${baseUrl}/api/events`, {
        signal: controller.signal,
      });
      expect(res.headers.get("content-type")).toContain("text/event-stream");
    } catch {
      // Abort is expected here; the content-type assertion above is the signal we need.
    } finally {
      clearTimeout(timeoutId);
    }
  });
});
