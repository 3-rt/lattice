// packages/adapters/claude-code/tests/claude-code-adapter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClaudeCodeAdapter } from "../src/claude-code-adapter.js";
import type { Task } from "@lattice/adapter-base";

// Mock the SDK module
vi.mock("@anthropic-ai/claude-code", () => ({
  query: vi.fn(),
}));

import { query } from "@anthropic-ai/claude-code";
const mockQuery = vi.mocked(query);

function makeTask(text: string, id = "test-task-1"): Task {
  return {
    id,
    status: "working",
    artifacts: [],
    history: [{ role: "user", parts: [{ type: "text", text }] }],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedAgent: "claude-code",
      routingReason: "explicit",
      latencyMs: 0,
    },
  };
}

describe("ClaudeCodeAdapter", () => {
  let adapter: ReturnType<typeof createClaudeCodeAdapter>;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = createClaudeCodeAdapter();
  });

  describe("getAgentCard", () => {
    it("should return a valid agent card", () => {
      const card = adapter.getAgentCard();
      expect(card.name).toBe("claude-code");
      expect(card.capabilities.streaming).toBe(true);
      expect(card.skills.length).toBeGreaterThan(0);
      expect(card.skills.map((s) => s.id)).toContain("code-generation");
    });
  });

  describe("executeTask", () => {
    it("should map task text to SDK query and return artifacts", async () => {
      mockQuery.mockResolvedValue([
        { type: "result", result: "Here is the fixed code:\n```ts\nconst x = 1;\n```", subtype: "success" },
      ]);

      const task = makeTask("fix the bug in auth.ts");
      const result = await adapter.executeTask(task);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "fix the bug in auth.ts",
          options: expect.objectContaining({
            maxTurns: 10,
          }),
        })
      );

      expect(result.status).toBe("completed");
      expect(result.artifacts.length).toBe(1);
      expect(result.artifacts[0].parts[0].type).toBe("text");
      expect(result.artifacts[0].parts[0].text).toContain("fixed code");
    });

    it("should handle SDK errors and return failed task", async () => {
      mockQuery.mockRejectedValue(new Error("API rate limit exceeded"));

      const task = makeTask("do something");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("failed");
      expect(result.artifacts[0].parts[0].text).toContain("API rate limit exceeded");
    });

    it("should include full conversation history in prompt", async () => {
      mockQuery.mockResolvedValue([
        { type: "result", result: "Done.", subtype: "success" },
      ]);

      const task = makeTask("initial request");
      task.history.push({ role: "agent", parts: [{ type: "text", text: "What file?" }] });
      task.history.push({ role: "user", parts: [{ type: "text", text: "auth.ts" }] });

      await adapter.executeTask(task);

      expect(mockQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining("auth.ts"),
        })
      );
    });

    it("should handle empty SDK response", async () => {
      mockQuery.mockResolvedValue([]);

      const task = makeTask("do something");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("completed");
      expect(result.artifacts.length).toBe(1);
      expect(result.artifacts[0].parts[0].text).toBe("");
    });
  });

  describe("healthCheck", () => {
    it("should return true when SDK is available", async () => {
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });
  });

  describe("streamTask", () => {
    it("should yield progress updates from SDK streaming", async () => {
      mockQuery.mockResolvedValue([
        { type: "assistant", message: { content: [{ type: "text", text: "Thinking..." }] } },
        { type: "result", result: "Done: fixed the bug", subtype: "success" },
      ]);

      const task = makeTask("fix the bug");
      const updates: Array<{ status: string; message?: string }> = [];

      for await (const update of adapter.streamTask(task)) {
        updates.push(update);
      }

      expect(updates.length).toBeGreaterThanOrEqual(1);
      const lastUpdate = updates[updates.length - 1];
      expect(lastUpdate.status).toBe("completed");
    });
  });
});
