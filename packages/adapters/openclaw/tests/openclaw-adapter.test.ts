import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOpenClawAdapter } from "../src/openclaw-adapter.js";
import type { Task } from "@lattice/adapter-base";

function makeTask(text: string, id = "test-task-1"): Task {
  return {
    id,
    status: "working",
    artifacts: [],
    history: [{ role: "user", parts: [{ type: "text", text }] }],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedAgent: "openclaw",
      routingReason: "explicit",
      latencyMs: 0,
    },
  };
}

describe("OpenClawAdapter", () => {
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function createAdapter() {
    return createOpenClawAdapter({
      gatewayUrl: "http://localhost:18789",
      gatewayToken: "test-token-123",
    });
  }

  describe("getAgentCard", () => {
    it("should return a valid agent card with correct skills", () => {
      const adapter = createAdapter();
      const card = adapter.getAgentCard();
      expect(card.name).toBe("openclaw");
      expect(card.capabilities.streaming).toBe(false);
      expect(card.skills.map((s) => s.id)).toEqual(
        expect.arrayContaining(["messaging", "scheduling", "web-browsing", "file-management"])
      );
    });
  });

  describe("executeTask", () => {
    it("should send chat completion request and return artifact", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "Message sent to #general" } }],
          }),
      });

      const adapter = createAdapter();
      const task = makeTask("send a message to the team");
      const result = await adapter.executeTask(task);

      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:18789/v1/chat/completions",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token-123",
            "Content-Type": "application/json",
          }),
        })
      );

      expect(result.status).toBe("completed");
      expect(result.artifacts[0].parts[0].text).toBe("Message sent to #general");
    });

    it("should handle HTTP errors", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      const adapter = createAdapter();
      const task = makeTask("do something");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("failed");
      expect(result.artifacts[0].parts[0].text).toContain("401");
    });

    it("should handle network errors", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const adapter = createAdapter();
      const task = makeTask("do something");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("failed");
      expect(result.artifacts[0].parts[0].text).toContain("ECONNREFUSED");
    });

    it("should map multi-turn history to chat messages", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "Done." } }],
          }),
      });

      const adapter = createAdapter();
      const task = makeTask("send a message");
      task.history.push({ role: "agent", parts: [{ type: "text", text: "To whom?" }] });
      task.history.push({ role: "user", parts: [{ type: "text", text: "The team" }] });

      await adapter.executeTask(task);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages).toHaveLength(3);
      expect(body.messages[0].role).toBe("user");
      expect(body.messages[1].role).toBe("assistant");
      expect(body.messages[2].role).toBe("user");
    });
  });

  describe("streamTask", () => {
    it("should yield a single result from executeTask", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            choices: [{ message: { content: "Streamed result" } }],
          }),
      });

      const adapter = createAdapter();
      const task = makeTask("do something");
      const updates: unknown[] = [];

      for await (const update of adapter.streamTask(task)) {
        updates.push(update);
      }

      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        taskId: "test-task-1",
        status: "completed",
      });
    });
  });

  describe("healthCheck", () => {
    it("should return true when gateway responds", async () => {
      mockFetch.mockResolvedValue({ ok: true });

      const adapter = createAdapter();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });

    it("should return false when gateway is down", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));

      const adapter = createAdapter();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });
  });
});
