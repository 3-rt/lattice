import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type LatticeDB } from "../src/db.js";
import fs from "fs";
import path from "path";

const TEST_DB_PATH = path.join(import.meta.dirname, "test.db");

describe("LatticeDB", () => {
  let db: LatticeDB;

  beforeEach(() => {
    db = createDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("agents", () => {
    it("should insert and retrieve an agent", () => {
      const card = {
        name: "test-agent",
        description: "A test agent",
        url: "http://localhost:3100/a2a/agents/test-agent",
        version: "1.0.0",
        capabilities: { streaming: false, pushNotifications: false },
        skills: [],
        authentication: { schemes: [] },
      };

      db.upsertAgent("test-agent", card);
      const agents = db.listAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe("test-agent");
      expect(agents[0].status).toBe("online");
      expect(JSON.parse(agents[0].agent_card)).toEqual(card);
    });

    it("should update agent status", () => {
      const card = {
        name: "test-agent",
        description: "A test agent",
        url: "http://localhost:3100/a2a/agents/test-agent",
        version: "1.0.0",
        capabilities: { streaming: false, pushNotifications: false },
        skills: [],
        authentication: { schemes: [] },
      };

      db.upsertAgent("test-agent", card);
      db.updateAgentStatus("test-agent", "offline");
      const agents = db.listAgents();

      expect(agents[0].status).toBe("offline");
    });

    it("should delete an agent", () => {
      const card = {
        name: "test-agent",
        description: "A test agent",
        url: "http://localhost:3100/a2a/agents/test-agent",
        version: "1.0.0",
        capabilities: { streaming: false, pushNotifications: false },
        skills: [],
        authentication: { schemes: [] },
      };

      db.upsertAgent("test-agent", card);
      db.deleteAgent("test-agent");
      const agents = db.listAgents();

      expect(agents).toHaveLength(0);
    });
  });

  describe("tasks", () => {
    it("should insert and retrieve a task", () => {
      const taskId = "task-123";
      const history = [{ role: "user" as const, parts: [{ type: "text" as const, text: "fix the bug" }] }];

      db.insertTask(taskId, history);
      const task = db.getTask(taskId);

      expect(task).toBeDefined();
      expect(task!.id).toBe(taskId);
      expect(task!.status).toBe("submitted");
      expect(JSON.parse(task!.history)).toEqual(history);
    });

    it("should update task status and assigned agent", () => {
      const taskId = "task-123";
      const history = [{ role: "user" as const, parts: [{ type: "text" as const, text: "fix the bug" }] }];

      db.insertTask(taskId, history);
      db.updateTask(taskId, {
        status: "working",
        assigned_agent: "claude-code",
        routing_reason: "skill match: coding",
      });
      const task = db.getTask(taskId);

      expect(task!.status).toBe("working");
      expect(task!.assigned_agent).toBe("claude-code");
      expect(task!.routing_reason).toBe("skill match: coding");
    });

    it("should update task result on completion", () => {
      const taskId = "task-123";
      const history = [{ role: "user" as const, parts: [{ type: "text" as const, text: "fix" }] }];
      const result = [{ name: "output", parts: [{ type: "text", text: "fixed!" }] }];

      db.insertTask(taskId, history);
      db.updateTask(taskId, {
        status: "completed",
        result: JSON.stringify(result),
        latency_ms: 1200,
      });
      const task = db.getTask(taskId);

      expect(task!.status).toBe("completed");
      expect(JSON.parse(task!.result!)).toEqual(result);
      expect(task!.latency_ms).toBe(1200);
    });

    it("should list tasks with optional status filter", () => {
      const history = [{ role: "user" as const, parts: [{ type: "text" as const, text: "test" }] }];

      db.insertTask("t1", history);
      db.insertTask("t2", history);
      db.updateTask("t1", { status: "completed" });

      expect(db.listTasks()).toHaveLength(2);
      expect(db.listTasks({ status: "completed" })).toHaveLength(1);
      expect(db.listTasks({ status: "submitted" })).toHaveLength(1);
    });
  });

  describe("routing_stats", () => {
    it("should upsert routing stats", () => {
      db.updateRoutingStats("claude-code", "coding", true, 500, 0.01);
      db.updateRoutingStats("claude-code", "coding", true, 300, 0.02);
      db.updateRoutingStats("claude-code", "coding", false, 1000, 0);

      const stats = db.getRoutingStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].agent_name).toBe("claude-code");
      expect(stats[0].successes).toBe(2);
      expect(stats[0].failures).toBe(1);
      expect(stats[0].total_latency_ms).toBe(1800);
    });
  });
});
