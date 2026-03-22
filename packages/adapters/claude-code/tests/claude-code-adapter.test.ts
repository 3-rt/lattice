// packages/adapters/claude-code/tests/claude-code-adapter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { createClaudeCodeAdapter } from "../src/claude-code-adapter.js";
import type { Task } from "@lattice/adapter-base";

// Mock child_process.spawn
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
const mockSpawn = vi.mocked(spawn);

/** Create a fake ChildProcess that emits the given stdout, stderr, and exit code. */
function fakeProcess(
  stdout: string,
  stderr = "",
  code = 0,
): ReturnType<typeof spawn> {
  const proc = new EventEmitter() as ReturnType<typeof spawn>;

  const stdoutStream = new EventEmitter() as ReturnType<typeof spawn>["stdout"];
  const stderrStream = new EventEmitter() as ReturnType<typeof spawn>["stderr"];

  // Make stdout async-iterable for streamTask
  (stdoutStream as unknown as Record<string, unknown>)[Symbol.asyncIterator] =
    async function* () {
      yield stdout;
    };

  proc.stdout = stdoutStream;
  proc.stderr = stderrStream;
  proc.kill = vi.fn();

  // Emit data then close on next tick so listeners can attach
  process.nextTick(() => {
    stdoutStream.emit("data", Buffer.from(stdout));
    stderrStream.emit("data", Buffer.from(stderr));
    proc.emit("close", code);
  });

  return proc;
}

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
    it("should spawn claude CLI and return result artifact", async () => {
      const jsonResult = JSON.stringify({
        result: "Here is the fixed code:\n```ts\nconst x = 1;\n```",
      });
      mockSpawn.mockReturnValue(fakeProcess(jsonResult));

      const task = makeTask("fix the bug in auth.ts");
      const result = await adapter.executeTask(task);

      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.arrayContaining(["--print", "--output-format", "json"]),
        expect.any(Object),
      );

      expect(result.status).toBe("completed");
      expect(result.artifacts.length).toBe(1);
      expect(result.artifacts[0].parts[0].text).toContain("fixed code");
    });

    it("should handle CLI errors and return failed task", async () => {
      mockSpawn.mockReturnValue(
        fakeProcess("", "API rate limit exceeded", 1),
      );

      const task = makeTask("do something");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("failed");
      expect(result.artifacts[0].parts[0].text).toContain(
        "API rate limit exceeded",
      );
    });

    it("should handle JSON error response", async () => {
      const jsonResult = JSON.stringify({
        is_error: true,
        error: "Authentication failed",
      });
      mockSpawn.mockReturnValue(fakeProcess(jsonResult));

      const task = makeTask("do something");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("failed");
      expect(result.artifacts[0].parts[0].text).toContain(
        "Authentication failed",
      );
    });

    it("should include full conversation history in prompt", async () => {
      const jsonResult = JSON.stringify({ result: "Done." });
      mockSpawn.mockReturnValue(fakeProcess(jsonResult));

      const task = makeTask("initial request");
      task.history.push({
        role: "agent",
        parts: [{ type: "text", text: "What file?" }],
      });
      task.history.push({
        role: "user",
        parts: [{ type: "text", text: "auth.ts" }],
      });

      await adapter.executeTask(task);

      // The prompt (last arg to spawn) should contain both user messages
      const args = mockSpawn.mock.calls[0][1] as string[];
      const prompt = args[args.length - 1];
      expect(prompt).toContain("auth.ts");
    });

    it("should handle empty CLI response", async () => {
      const jsonResult = JSON.stringify({ result: "" });
      mockSpawn.mockReturnValue(fakeProcess(jsonResult));

      const task = makeTask("do something");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("completed");
      expect(result.artifacts.length).toBe(1);
      expect(result.artifacts[0].parts[0].text).toBe("");
    });

    it("should handle non-JSON output as plain text result", async () => {
      mockSpawn.mockReturnValue(fakeProcess("Hello, plain text!"));

      const task = makeTask("say hello");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("completed");
      expect(result.artifacts[0].parts[0].text).toBe("Hello, plain text!");
    });
  });

  describe("healthCheck", () => {
    it("should return true when claude binary is found", async () => {
      mockSpawn.mockReturnValue(fakeProcess("1.0.0"));
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        ["--version"],
        expect.any(Object),
      );
    });

    it("should return false when claude binary is not found", async () => {
      mockSpawn.mockReturnValue(fakeProcess("", "", 127));
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });
  });

  describe("streamTask", () => {
    it("should yield progress updates from stream-json output", async () => {
      const lines = [
        JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: "Thinking..." }] },
        }),
        JSON.stringify({
          type: "result",
          result: "Done: fixed the bug",
          subtype: "success",
        }),
      ].join("\n");

      mockSpawn.mockReturnValue(fakeProcess(lines));

      const task = makeTask("fix the bug");
      const updates: Array<{ status: string; message?: string }> = [];

      for await (const update of adapter.streamTask(task)) {
        updates.push(update);
      }

      expect(updates.length).toBe(2);
      expect(updates[0].status).toBe("working");
      expect(updates[0].message).toBe("Thinking...");
      expect(updates[1].status).toBe("completed");
    });
  });
});
