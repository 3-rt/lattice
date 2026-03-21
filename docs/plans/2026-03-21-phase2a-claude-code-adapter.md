# Phase 2a: Claude Code Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an adapter that wraps the `@anthropic-ai/claude-code` SDK, implementing the `LatticeAdapter` interface so Claude Code can be orchestrated through the Lattice relay.

**Architecture:** In-process TypeScript module that maps A2A Task objects to Claude Code SDK conversations and SDK responses back to A2A Artifacts. The adapter is instantiated by the relay's `main.ts` on startup when `adapters.claude-code.enabled` is `true` in `lattice.config.json`. Streaming is supported via the SDK's streaming API, yielding `TaskStatusUpdate` events.

**Tech Stack:** TypeScript, `@anthropic-ai/claude-code` SDK, Vitest

**Spec:** `docs/specs/2026-03-21-lattice-design.md` (section: Claude Code Adapter)

---

## File Structure

```
packages/adapters/claude-code/
├── src/
│   ├── claude-code-adapter.ts   # LatticeAdapter implementation
│   └── index.ts                 # Re-exports
├── tests/
│   └── claude-code-adapter.test.ts
├── package.json
└── tsconfig.json
```

Also modifies:
- `packages/relay/src/main.ts` — adapter loading from config

---

### Task 1: Package Scaffold

**Files:**
- Create: `packages/adapters/claude-code/package.json`
- Create: `packages/adapters/claude-code/tsconfig.json`
- Create: `packages/adapters/claude-code/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
// packages/adapters/claude-code/package.json
{
  "name": "@lattice/adapter-claude-code",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run"
  },
  "dependencies": {
    "@lattice/adapter-base": "*",
    "@anthropic-ai/claude-code": "^0.2.0"
  },
  "files": ["dist"]
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
// packages/adapters/claude-code/tsconfig.json
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
// packages/adapters/claude-code/src/index.ts
export { createClaudeCodeAdapter } from "./claude-code-adapter.js";
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/claude-code/package.json packages/adapters/claude-code/tsconfig.json packages/adapters/claude-code/src/index.ts
git commit -m "feat(adapter-claude-code): scaffold package with dependencies"
```

---

### Task 2: Adapter Tests (TDD)

**Files:**
- Create: `packages/adapters/claude-code/tests/claude-code-adapter.test.ts`

The SDK is an external dependency, so we mock it. Tests verify the adapter correctly maps between A2A types and SDK calls.

- [ ] **Step 1: Write the test file**

```typescript
// packages/adapters/claude-code/tests/claude-code-adapter.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClaudeCodeAdapter } from "../src/claude-code-adapter.js";
import type { Task, Message } from "@lattice/adapter-base";

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/adapters/claude-code && npx vitest run
```

Expected: FAIL — `claude-code-adapter.ts` does not exist yet.

- [ ] **Step 3: Commit failing tests**

```bash
git add packages/adapters/claude-code/tests/claude-code-adapter.test.ts
git commit -m "test(adapter-claude-code): add failing tests for adapter implementation"
```

---

### Task 3: Adapter Implementation

**Files:**
- Create: `packages/adapters/claude-code/src/claude-code-adapter.ts`

- [ ] **Step 1: Implement the adapter**

```typescript
// packages/adapters/claude-code/src/claude-code-adapter.ts
import { query } from "@anthropic-ai/claude-code";
import type {
  LatticeAdapter,
  AgentCard,
  Task,
  TaskStatusUpdate,
  Artifact,
} from "@lattice/adapter-base";

const AGENT_CARD: AgentCard = {
  name: "claude-code",
  description: "Claude Code — AI coding assistant by Anthropic",
  url: "http://localhost:3100/a2a/agents/claude-code",
  version: "1.0.0",
  capabilities: { streaming: true, pushNotifications: false },
  skills: [
    { id: "code-generation", name: "Code Generation", description: "Generate code from descriptions", tags: ["code", "generate", "write", "create", "implement"] },
    { id: "code-review", name: "Code Review", description: "Review code for issues", tags: ["review", "audit", "check"] },
    { id: "debugging", name: "Debugging", description: "Find and fix bugs", tags: ["debug", "fix", "bug", "error"] },
    { id: "refactoring", name: "Refactoring", description: "Refactor and improve code", tags: ["refactor", "improve", "clean", "optimize"] },
    { id: "git-operations", name: "Git Operations", description: "Git commands and workflows", tags: ["git", "commit", "branch", "merge"] },
  ],
  authentication: { schemes: [] },
};

function buildPrompt(task: Task): string {
  // Concatenate all user messages into a single prompt for the SDK
  const parts = task.history
    .filter((m) => m.role === "user")
    .flatMap((m) => m.parts)
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!);
  return parts.join("\n\n");
}

function extractResultText(messages: unknown[]): string {
  // Find the last result message from the SDK response
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i] as Record<string, unknown>;
    if (msg.type === "result" && typeof msg.result === "string") {
      return msg.result;
    }
  }
  return "";
}

export function createClaudeCodeAdapter(): LatticeAdapter {
  return {
    getAgentCard(): AgentCard {
      return AGENT_CARD;
    },

    async executeTask(task: Task): Promise<Task> {
      const prompt = buildPrompt(task);

      let resultText: string;
      try {
        const messages = await query({
          prompt,
          options: { maxTurns: 10 },
        });
        resultText = extractResultText(messages);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          ...task,
          status: "failed",
          artifacts: [{ name: "error", parts: [{ type: "text", text: errorMsg }] }],
        };
      }

      const artifact: Artifact = {
        name: "result",
        parts: [{ type: "text", text: resultText }],
      };

      return {
        ...task,
        status: "completed",
        artifacts: [artifact],
      };
    },

    async *streamTask(task: Task): AsyncGenerator<TaskStatusUpdate> {
      const prompt = buildPrompt(task);

      try {
        const messages = await query({
          prompt,
          options: { maxTurns: 10 },
        });

        // Yield progress for assistant messages
        for (const msg of messages) {
          const m = msg as Record<string, unknown>;
          if (m.type === "assistant") {
            const content = (m.message as Record<string, unknown>)?.content as Array<Record<string, unknown>> | undefined;
            const text = content?.find((c) => c.type === "text")?.text as string | undefined;
            if (text) {
              yield { taskId: task.id, status: "working", message: text };
            }
          }
        }

        // Yield final completion
        const resultText = extractResultText(messages);
        yield {
          taskId: task.id,
          status: "completed",
          artifacts: [{ name: "result", parts: [{ type: "text", text: resultText }] }],
        };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        yield { taskId: task.id, status: "failed", message: errorMsg };
      }
    },

    async healthCheck(): Promise<boolean> {
      // Claude Code SDK is available if we can import it (no ping endpoint)
      return true;
    },
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/adapters/claude-code && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/claude-code/src/claude-code-adapter.ts packages/adapters/claude-code/src/index.ts
git commit -m "feat(adapter-claude-code): implement LatticeAdapter with SDK mapping"
```

---

### Task 4: Adapter Loading in Relay main.ts

**Files:**
- Modify: `packages/relay/src/main.ts`
- Modify: `packages/relay/package.json` (add adapter dependency)

This task adds the adapter auto-loading pattern that Phase 2b and 2c will also use.

- [ ] **Step 1: Add adapter dependency to relay**

Add to `packages/relay/package.json` dependencies:

```json
"@lattice/adapter-claude-code": "*"
```

- [ ] **Step 2: Update main.ts to load adapters from config**

Replace `packages/relay/src/main.ts` with:

```typescript
// packages/relay/src/main.ts
import fs from "fs";
import path from "path";
import { createDatabase } from "./db.js";
import { createEventBus } from "./event-bus.js";
import { createRegistry } from "./registry.js";
import { createRouter } from "./router.js";
import { createTaskManager } from "./task-manager.js";
import { createApp } from "./server.js";

const configPath = path.resolve(process.cwd(), "lattice.config.json");
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
  : { relay: { port: 3100, host: "localhost" } };

const port = config.relay?.port ?? 3100;
const host = config.relay?.host ?? "localhost";

const db = createDatabase(path.resolve(process.cwd(), "lattice.db"));
const bus = createEventBus();
const registry = createRegistry(db, bus);
const router = createRouter(registry);
const taskManager = createTaskManager(db, bus, registry, router);
const app = createApp({ db, registry, taskManager, bus });

// Load enabled adapters from config
async function loadAdapters() {
  const adapters = config.adapters ?? {};

  if (adapters["claude-code"]?.enabled) {
    try {
      const { createClaudeCodeAdapter } = await import("@lattice/adapter-claude-code");
      registry.register(createClaudeCodeAdapter());
      console.log("  ✓ claude-code adapter loaded");
    } catch (err) {
      console.error("  ✗ claude-code adapter failed to load:", err instanceof Error ? err.message : err);
    }
  }

  // Future adapters (2b, 2c) will be added here:
  // if (adapters["openclaw"]?.enabled) { ... }
  // if (adapters["codex"]?.enabled) { ... }
}

loadAdapters().then(() => {
  app.listen(port, host, () => {
    console.log(`Lattice relay server running at http://${host}:${port}`);
    console.log(`SSE endpoint: http://${host}:${port}/api/events`);
    console.log(`Agents registered: ${registry.listAgents().length}`);
  });

  setInterval(() => registry.runHealthChecks(), 30_000);
});
```

- [ ] **Step 3: Run full test suite to ensure no regressions**

```bash
npx vitest run
```

Expected: All 45+ existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/relay/src/main.ts packages/relay/package.json
git commit -m "feat(relay): add adapter auto-loading from config on startup"
```
