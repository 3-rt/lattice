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

    it("should store and filter conversation-linked tasks", () => {
      const history = [{ role: "user" as const, parts: [{ type: "text" as const, text: "continue debugging" }] }];

      db.insertTask("t1", history, "conv-1");
      db.insertTask("t2", history, "conv-2");

      expect(db.getTask("t1")!.conversation_id).toBe("conv-1");
      expect(db.listTasks({ conversation_id: "conv-1" }).map((task) => task.id)).toEqual(["t1"]);
    });
  });

  describe("conversations", () => {
    it("should insert and retrieve a conversation", () => {
      db.insertConversation("conv-1", "OpenClaw debugging", "lattice-conv-conv-1");

      const conversation = db.getConversation("conv-1");

      expect(conversation).toBeDefined();
      expect(conversation!.title).toBe("OpenClaw debugging");
      expect(conversation!.summary).toBe("");
      expect(conversation!.openclaw_session_key).toBe("lattice-conv-conv-1");
    });

    it("should list conversations with the most recently updated first", async () => {
      db.insertConversation("conv-1", "First", "lattice-conv-conv-1");
      await new Promise((resolve) => setTimeout(resolve, 1100));
      db.insertConversation("conv-2", "Second", "lattice-conv-conv-2");

      expect(db.listConversations().map((conversation) => conversation.id)).toEqual(["conv-2", "conv-1"]);
    });

    it("should update conversation title and summary", () => {
      db.insertConversation("conv-1", "Original", "lattice-conv-conv-1");

      db.updateConversation("conv-1", {
        title: "Updated",
        summary: "- User is debugging OpenClaw.",
      });

      const conversation = db.getConversation("conv-1")!;
      expect(conversation.title).toBe("Updated");
      expect(conversation.summary).toBe("- User is debugging OpenClaw.");
    });

    it("should insert and list conversation messages chronologically", async () => {
      db.insertConversation("conv-1", "OpenClaw debugging", "lattice-conv-conv-1");
      db.insertConversationMessage({
        id: "msg-1",
        conversationId: "conv-1",
        role: "user",
        content: "why did that fail?",
      });
      await new Promise((resolve) => setTimeout(resolve, 1100));
      db.insertConversationMessage({
        id: "msg-2",
        conversationId: "conv-1",
        role: "agent",
        agentName: "openclaw",
        taskId: "task-1",
        content: "Drive auth is missing.",
      });

      const messages = db.listConversationMessages("conv-1");

      expect(messages.map((message) => message.id)).toEqual(["msg-1", "msg-2"]);
      expect(messages[1].agent_name).toBe("openclaw");
      expect(messages[1].task_id).toBe("task-1");
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
