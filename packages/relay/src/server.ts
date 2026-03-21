import express from "express";
import cors from "cors";
import { v4 as uuidv4 } from "uuid";
import { createSSEHandler } from "./sse.js";
import type { LatticeDB } from "./db.js";
import type { LatticeRegistry } from "./registry.js";
import type { LatticeTaskManager } from "./task-manager.js";
import type { LatticeEventBus } from "./event-bus.js";
import type { LatticeWorkflowEngine } from "./workflow-engine.js";

interface ServerDeps {
  db: LatticeDB;
  registry: LatticeRegistry;
  taskManager: LatticeTaskManager;
  bus: LatticeEventBus;
  workflowEngine?: LatticeWorkflowEngine;
}

export function createApp({ db, registry, taskManager, bus, workflowEngine }: ServerDeps) {
  const app = express();
  app.use(cors({ origin: /localhost/ }));
  app.use(express.json());

  app.get("/api/agents", (_req, res) => {
    const agents = registry.listAgents().map((a) => ({
      name: a.name,
      status: a.status,
      card: a.card,
    }));
    res.json(agents);
  });

  app.post("/api/tasks", async (req, res) => {
    try {
      const { text, agent, execute } = req.body;
      if (!text) { res.status(400).json({ error: "text is required" }); return; }
      const task = await taskManager.createTask(text, agent);
      if (execute) {
        const result = await taskManager.executeTask(task.id);
        res.status(201).json(result);
        return;
      }
      res.status(201).json(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/tasks", (_req, res) => {
    const status = _req.query.status as string | undefined;
    const tasks = taskManager.listTasks(status ? { status } : undefined);
    res.json(tasks);
  });

  app.get("/api/tasks/:id", (req, res) => {
    const task = taskManager.getTask(req.params.id);
    if (!task) { res.status(404).json({ error: "Task not found" }); return; }
    res.json(task);
  });

  app.post("/api/tasks/:id/cancel", (req, res) => {
    try {
      taskManager.cancelTask(req.params.id);
      const task = taskManager.getTask(req.params.id);
      res.json(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/tasks/:id/input", (req, res) => {
    try {
      const { text } = req.body;
      if (!text) { res.status(400).json({ error: "text is required" }); return; }
      taskManager.provideInput(req.params.id, text);
      const task = taskManager.getTask(req.params.id);
      res.json(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/routing/stats", (_req, res) => {
    res.json(db.getRoutingStats());
  });

  app.get("/api/events", createSSEHandler(bus));

  // --- Workflow routes ---
  app.get("/api/workflows", (_req, res) => {
    const workflows = db.listWorkflows();
    res.json(workflows.map((w) => ({ ...w, definition: JSON.parse(w.definition) })));
  });

  app.post("/api/workflows", (req, res) => {
    const { name, definition } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    if (!definition) { res.status(400).json({ error: "definition is required" }); return; }
    const id = uuidv4();
    db.insertWorkflow(id, name, definition);
    res.status(201).json({ id, name, definition });
  });

  app.post("/api/workflows/:id/run", async (req, res) => {
    try {
      if (!workflowEngine) { res.status(500).json({ error: "Workflow engine not configured" }); return; }
      const wf = db.getWorkflow(req.params.id);
      if (!wf) { res.status(404).json({ error: "Workflow not found" }); return; }
      const result = await workflowEngine.runWorkflow(req.params.id);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/workflows/:id/runs", (req, res) => {
    const runs = db.listWorkflowRuns(req.params.id);
    res.json(runs.map((r) => ({ ...r, context: r.context ? JSON.parse(r.context) : null })));
  });

  return app;
}
