# Phase 2c: Codex Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an adapter that wraps the Codex CLI via child process, implementing the `LatticeAdapter` interface so Codex can be orchestrated through the Lattice relay.

**Architecture:** In-process TypeScript module that spawns `codex --quiet` as a child process, pipes the task text to stdin, captures stdout/stderr, and maps the output into A2A Artifacts. Exit code 0 = success, non-zero = failure. The Codex binary path is configurable via `lattice.config.json`.

**Tech Stack:** TypeScript, Node.js `child_process`, Vitest

**Spec:** `docs/specs/2026-03-21-lattice-design.md` (section: Codex Adapter)

**Depends on:** Phase 2a Task 4 (adapter loading pattern in `main.ts`)

---

## File Structure

```
packages/adapters/codex/
├── src/
│   ├── codex-adapter.ts   # LatticeAdapter implementation
│   └── index.ts           # Re-exports
├── tests/
│   └── codex-adapter.test.ts
├── package.json
└── tsconfig.json
```

Also modifies:
- `packages/relay/src/main.ts` — add Codex to adapter loading
- `packages/relay/package.json` — add dependency

---

### Task 1: Package Scaffold

**Files:**
- Create: `packages/adapters/codex/package.json`
- Create: `packages/adapters/codex/tsconfig.json`
- Create: `packages/adapters/codex/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
// packages/adapters/codex/package.json
{
  "name": "@lattice/adapter-codex",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run"
  },
  "dependencies": {
    "@lattice/adapter-base": "*"
  },
  "files": ["dist"]
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
// packages/adapters/codex/tsconfig.json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create placeholder index.ts**

```typescript
// packages/adapters/codex/src/index.ts
export { createCodexAdapter } from "./codex-adapter.js";
export type { CodexConfig } from "./codex-adapter.js";
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/codex/
git commit -m "feat(adapter-codex): scaffold package"
```

---

### Task 2: Adapter Tests (TDD)

**Files:**
- Create: `packages/adapters/codex/tests/codex-adapter.test.ts`

We mock `child_process.execFile` to test without a real Codex binary.

- [ ] **Step 1: Write the test file**

```typescript
// packages/adapters/codex/tests/codex-adapter.test.ts
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

// Helper to make execFile call the callback
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
    it("should spawn codex with --quiet flag and return stdout as artifact", async () => {
      mockExecFileSuccess("Fixed the bug in auth.ts\n```diff\n-old\n+new\n```");

      const adapter = createAdapter();
      const task = makeTask("fix the bug in auth.ts");
      const result = await adapter.executeTask(task);

      expect(mockExecFile).toHaveBeenCalledWith(
        "/usr/local/bin/codex",
        expect.arrayContaining(["--quiet"]),
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
      const prompt = args[args.indexOf("--quiet") + 1] ?? args[args.length - 1];
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/adapters/codex && npx vitest run
```

Expected: FAIL — `codex-adapter.ts` does not exist yet.

- [ ] **Step 3: Commit failing tests**

```bash
git add packages/adapters/codex/tests/codex-adapter.test.ts
git commit -m "test(adapter-codex): add failing tests for adapter implementation"
```

---

### Task 3: Adapter Implementation

**Files:**
- Create: `packages/adapters/codex/src/codex-adapter.ts`

- [ ] **Step 1: Implement the adapter**

```typescript
// packages/adapters/codex/src/codex-adapter.ts
import { execFile } from "child_process";
import type {
  LatticeAdapter,
  AgentCard,
  Task,
  TaskStatusUpdate,
  Artifact,
} from "@lattice/adapter-base";

export interface CodexConfig {
  codexPath: string;
}

const AGENT_CARD: AgentCard = {
  name: "codex",
  description: "Codex — OpenAI's coding agent via CLI",
  url: "http://localhost:3100/a2a/agents/codex",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
  skills: [
    { id: "code-generation", name: "Code Generation", description: "Generate code from descriptions", tags: ["code", "generate", "write", "create"] },
    { id: "code-review", name: "Code Review", description: "Review code for issues", tags: ["review", "audit", "check"] },
    { id: "terminal-commands", name: "Terminal Commands", description: "Run terminal commands", tags: ["terminal", "command", "shell", "run"] },
  ],
  authentication: { schemes: [] },
};

function buildPrompt(task: Task): string {
  return task.history
    .filter((m) => m.role === "user")
    .flatMap((m) => m.parts)
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!)
    .join("\n\n");
}

function runCodex(codexPath: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(codexPath, args, { timeout: 5 * 60 * 1000 }, (err, stdout, stderr) => {
      if (err) {
        reject({ error: err, stdout: stdout ?? "", stderr: stderr ?? "" });
      } else {
        resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
      }
    });
  });
}

export function createCodexAdapter(config: CodexConfig): LatticeAdapter {
  const { codexPath } = config;

  return {
    getAgentCard(): AgentCard {
      return AGENT_CARD;
    },

    async executeTask(task: Task): Promise<Task> {
      const prompt = buildPrompt(task);

      try {
        const { stdout } = await runCodex(codexPath, ["--quiet", prompt]);
        const artifact: Artifact = {
          name: "result",
          parts: [{ type: "text", text: stdout.trim() }],
        };
        return { ...task, status: "completed", artifacts: [artifact] };
      } catch (rejection) {
        const { stderr } = rejection as { error: Error; stdout: string; stderr: string };
        return {
          ...task,
          status: "failed",
          artifacts: [{ name: "error", parts: [{ type: "text", text: stderr || "Codex execution failed" }] }],
        };
      }
    },

    async *streamTask(task: Task): AsyncGenerator<TaskStatusUpdate> {
      // Codex CLI doesn't support streaming — execute and yield result
      const result = await this.executeTask(task);
      yield {
        taskId: task.id,
        status: result.status,
        message: result.artifacts[0]?.parts[0]?.text,
        artifacts: result.artifacts,
      };
    },

    async healthCheck(): Promise<boolean> {
      try {
        await runCodex(codexPath, ["--version"]);
        return true;
      } catch {
        return false;
      }
    },
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/adapters/codex && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/codex/src/
git commit -m "feat(adapter-codex): implement LatticeAdapter with CLI child process wrapper"
```

---

### Task 4: Register in Relay main.ts

**Files:**
- Modify: `packages/relay/src/main.ts`
- Modify: `packages/relay/package.json`

- [ ] **Step 1: Add dependency to relay**

Add to `packages/relay/package.json` dependencies:

```json
"@lattice/adapter-codex": "*"
```

- [ ] **Step 2: Add Codex loading to main.ts loadAdapters()**

Add after the OpenClaw block in `loadAdapters()`:

```typescript
  if (adapters["codex"]?.enabled) {
    try {
      const { createCodexAdapter } = await import("@lattice/adapter-codex");
      const codexPath = adapters["codex"].codexPath ?? "codex";
      registry.register(createCodexAdapter({ codexPath }));
      console.log("  ✓ codex adapter loaded");
    } catch (err) {
      console.error("  ✗ codex adapter failed to load:", err instanceof Error ? err.message : err);
    }
  }
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/relay/src/main.ts packages/relay/package.json
git commit -m "feat(relay): add codex adapter loading from config"
```
