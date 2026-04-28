import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCodexAdapter } from "../src/codex-adapter.js";
import type { Task } from "@lattice/adapter-base";
import * as childProcess from "child_process";
import { EventEmitter } from "node:events";

vi.mock("child_process", () => ({
  spawn: vi.fn(),
}));

const mockSpawn = vi.mocked(childProcess.spawn);

function makeTask(text: string, id = "test-task-1"): Task {
  return {
    id,
    status: "working",
    artifacts: [],
    history: [{ role: "user", parts: [{ type: "text", text }] }],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedAgent: "codex",
      routingReason: "explicit",
      latencyMs: 0,
    },
  };
}

function mockChildProcess(stdout: string, stderr = "", code = 0, error?: Error) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof vi.fn>;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();

  queueMicrotask(() => {
    if (stdout) child.stdout.emit("data", Buffer.from(stdout));
    if (stderr) child.stderr.emit("data", Buffer.from(stderr));
    if (error) child.emit("error", error);
    else child.emit("close", code);
  });

  return child as any;
}

function mockSpawnSuccess(stdout: string) {
  mockSpawn.mockImplementation(() => mockChildProcess(stdout));
}

function mockSpawnFailure(stderr: string, code = 1) {
  mockSpawn.mockImplementation(() => mockChildProcess("", stderr, code));
}

describe("CodexAdapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function createAdapter() {
    return createCodexAdapter({ codexPath: "/usr/local/bin/codex" });
  }

  describe("getAgentCard", () => {
    it("should return a valid agent card with correct skills", () => {
      const adapter = createAdapter();
      const card = adapter.getAgentCard();
      expect(card.name).toBe("codex");
      expect(card.capabilities.streaming).toBe(false);
      expect(card.skills.map((s) => s.id)).toEqual(
        expect.arrayContaining(["code-generation", "code-review", "terminal-commands"])
      );
    });
  });

  describe("executeTask", () => {
    it("should spawn codex exec subcommand and return stdout as artifact", async () => {
      mockSpawnSuccess("Fixed the bug in auth.ts\n```diff\n-old\n+new\n```");

      const adapter = createAdapter();
      const task = makeTask("fix the bug in auth.ts");
      const result = await adapter.executeTask(task);

      expect(mockSpawn).toHaveBeenCalledWith(
        "/usr/local/bin/codex",
        expect.arrayContaining(["exec"]),
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      expect(result.status).toBe("completed");
      expect(result.artifacts[0].parts[0].text).toContain("Fixed the bug");
    });

    it("should handle non-zero exit code as failure", async () => {
      mockSpawnFailure("Error: file not found", 1);

      const adapter = createAdapter();
      const task = makeTask("do something impossible");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("failed");
      expect(result.artifacts[0].parts[0].text).toContain("file not found");
    });

    it("should use task text as the prompt argument", async () => {
      mockSpawnSuccess("Done.");

      const adapter = createAdapter();
      const task = makeTask("generate a hello world function");
      await adapter.executeTask(task);

      const args = mockSpawn.mock.calls[0][1] as string[];
      expect(args).toContain("generate a hello world function");
    });

    it("should concatenate multi-turn user messages", async () => {
      mockSpawnSuccess("Done.");

      const adapter = createAdapter();
      const task = makeTask("initial request");
      task.history.push({ role: "agent", parts: [{ type: "text", text: "What file?" }] });
      task.history.push({ role: "user", parts: [{ type: "text", text: "auth.ts" }] });

      await adapter.executeTask(task);

      const args = mockSpawn.mock.calls[0][1] as string[];
      const prompt = args[args.indexOf("exec") + 1] ?? args[args.length - 1];
      expect(prompt).toContain("initial request");
      expect(prompt).toContain("auth.ts");
    });
  });

  describe("healthCheck", () => {
    it("should return { ok: true } when codex binary exists", async () => {
      mockSpawnSuccess("codex v0.1.0");

      const adapter = createAdapter();
      const healthy = await adapter.healthCheck();
      expect(healthy).toEqual({ ok: true });
    });

    it("should return { ok: false, reason } when codex binary is not found", async () => {
      mockSpawn.mockImplementation(() => mockChildProcess("", "", 0, new Error("ENOENT")));

      const adapter = createAdapter();
      const healthy = await adapter.healthCheck();
      expect(healthy).toEqual({ ok: false, reason: expect.any(String) });
    });
  });
});
