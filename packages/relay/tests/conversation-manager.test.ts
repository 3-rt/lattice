import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentCard, LatticeAdapter, Task } from "@lattice/adapter-base";
import { createConversationManager } from "../src/conversation-manager.js";
import { createDatabase, type LatticeDB } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import { createRegistry } from "../src/registry.js";
import { createRouter } from "../src/router.js";
import { createTaskManager, type LatticeTaskManager } from "../src/task-manager.js";

function createMockAdapter(name: string, response = "done"): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "s1", name: "Skill", description: "A skill", tags: ["debug", "message", "code"] }],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn().mockImplementation(async (task: Task): Promise<Task> => ({
      ...task,
      status: "completed",
      artifacts: [{ name: "result", parts: [{ type: "text", text: response }] }],
    })),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("ConversationManager", () => {
  let db: LatticeDB;
  let taskManager: LatticeTaskManager;
  let adapter: LatticeAdapter;

  beforeEach(() => {
    db = createDatabase(":memory:");
    const bus = createEventBus();
    const registry = createRegistry(db, bus);
    adapter = createMockAdapter("openclaw", "Drive auth is missing.");
    registry.register(adapter);
    taskManager = createTaskManager(db, bus, registry, createRouter(registry));
  });

  it("creates a conversation with a stable OpenClaw session key", () => {
    const conversations = createConversationManager(db, taskManager);

    const conversation = conversations.createConversation("OpenClaw debugging");

    expect(conversation.title).toBe("OpenClaw debugging");
    expect(conversation.openclawSessionKey).toBe(`lattice-conv-${conversation.id}`);
  });

  it("dispatches a message, creates a linked task, and stores the agent response", async () => {
    const conversations = createConversationManager(db, taskManager);
    const conversation = conversations.createConversation("OpenClaw debugging");

    const result = await conversations.dispatchMessage({
      conversationId: conversation.id,
      text: "Why did Google Drive fail?",
      agent: "openclaw",
      execute: true,
    });

    expect(result.userMessage.content).toBe("Why did Google Drive fail?");
    expect(result.task.metadata.conversationId).toBe(conversation.id);
    expect(result.task.metadata.openclawSessionKey).toBe(conversation.openclawSessionKey);
    expect(result.agentMessage?.agentName).toBe("openclaw");
    expect(result.agentMessage?.taskId).toBe(result.task.id);
    expect(result.agentMessage?.content).toBe("Drive auth is missing.");

    const storedMessages = conversations.listMessages(conversation.id);
    expect(storedMessages.map((message) => message.role)).toEqual(["user", "agent"]);
  });

  it("includes prior conversation context in the created task prompt", async () => {
    const conversations = createConversationManager(db, taskManager);
    const conversation = conversations.createConversation("Debugging");
    db.insertConversationMessage({
      id: "prior-user",
      conversationId: conversation.id,
      role: "user",
      content: "OpenClaw failed with No auth for drive.",
    });

    const result = await conversations.dispatchMessage({
      conversationId: conversation.id,
      text: "What should I check next?",
      agent: "openclaw",
    });

    const taskText = result.task.history[0]?.parts[0]?.text ?? "";
    expect(taskText).toContain("Recent conversation:");
    expect(taskText).toContain("OpenClaw failed with No auth for drive.");
    expect(taskText).toContain("Current request:\nWhat should I check next?");
  });

  it("stores failed task output as an agent message", async () => {
    (adapter.executeTask as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "ignored",
      status: "failed",
      history: [],
      artifacts: [{ name: "error", parts: [{ type: "text", text: "No auth for drive basil@example.com" }] }],
      metadata: {
        createdAt: "",
        updatedAt: "",
        assignedAgent: "openclaw",
        routingReason: "",
        latencyMs: 0,
      },
    });
    const conversations = createConversationManager(db, taskManager);
    const conversation = conversations.createConversation("Debugging");

    const result = await conversations.dispatchMessage({
      conversationId: conversation.id,
      text: "Create a doc",
      agent: "openclaw",
    });

    expect(result.task.status).toBe("failed");
    expect(result.agentMessage?.content).toContain("Authentication failed");
  });
});
