import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCodexAdapter } from "../src/codex-adapter.js";
import type { Task } from "@lattice/adapter-base";
import * as childProcess from "child_process";

vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

const mockExecFile = vi.mocked(childProcess.execFile);

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

function mockExecFileSuccess(stdout: string) {
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    const cb = (typeof _opts === "function" ? _opts : callback) as Function;
    cb(null, stdout, "");
    return {} as any;
  });
}

function mockExecFileFailure(stderr: string, code = 1) {
  mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
    const cb = (typeof _opts === "function" ? _opts : callback) as Function;
    const err = new Error("Command failed") as Error & { code: number };
    err.code = code;
    cb(err, "", stderr);
    return {} as any;
  });
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
      mockExecFileSuccess("Fixed the bug in auth.ts\n```diff\n-old\n+new\n```");

      const adapter = createAdapter();
      const task = makeTask("fix the bug in auth.ts");
      const result = await adapter.executeTask(task);

      expect(mockExecFile).toHaveBeenCalledWith(
        "/usr/local/bin/codex",
        expect.arrayContaining(["exec"]),
        expect.any(Object),
        expect.any(Function)
      );

      expect(result.status).toBe("completed");
      expect(result.artifacts[0].parts[0].text).toContain("Fixed the bug");
    });

    it("should handle non-zero exit code as failure", async () => {
      mockExecFileFailure("Error: file not found", 1);

      const adapter = createAdapter();
      const task = makeTask("do something impossible");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("failed");
      expect(result.artifacts[0].parts[0].text).toContain("file not found");
    });

    it("should use task text as the prompt argument", async () => {
      mockExecFileSuccess("Done.");

      const adapter = createAdapter();
      const task = makeTask("generate a hello world function");
      await adapter.executeTask(task);

      const args = mockExecFile.mock.calls[0][1] as string[];
      expect(args).toContain("generate a hello world function");
    });

    it("should concatenate multi-turn user messages", async () => {
      mockExecFileSuccess("Done.");

      const adapter = createAdapter();
      const task = makeTask("initial request");
      task.history.push({ role: "agent", parts: [{ type: "text", text: "What file?" }] });
      task.history.push({ role: "user", parts: [{ type: "text", text: "auth.ts" }] });

      await adapter.executeTask(task);

      const args = mockExecFile.mock.calls[0][1] as string[];
      const prompt = args[args.indexOf("exec") + 1] ?? args[args.length - 1];
      expect(prompt).toContain("initial request");
      expect(prompt).toContain("auth.ts");
    });
  });

  describe("healthCheck", () => {
    it("should return true when codex binary exists", async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === "function" ? _opts : callback) as Function;
        cb(null, "codex v0.1.0", "");
        return {} as any;
      });

      const adapter = createAdapter();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(true);
    });

    it("should return false when codex binary is not found", async () => {
      mockExecFile.mockImplementation((_cmd, _args, _opts, callback) => {
        const cb = (typeof _opts === "function" ? _opts : callback) as Function;
        cb(new Error("ENOENT"), "", "");
        return {} as any;
      });

      const adapter = createAdapter();
      const healthy = await adapter.healthCheck();
      expect(healthy).toBe(false);
    });
  });
});
