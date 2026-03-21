# Phase 2b: OpenClaw Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an adapter that wraps the OpenClaw gateway REST API (`/v1/chat/completions`), implementing the `LatticeAdapter` interface so OpenClaw can be orchestrated through the Lattice relay.

**Architecture:** In-process TypeScript module that maps A2A Task objects to OpenClaw chat completion requests and parses responses back into A2A Artifacts. Auth via `OPENCLAW_GATEWAY_TOKEN` env var. Gateway URL from `lattice.config.json`. This is the second adapter — the cross-agent demo (Claude Code fix → OpenClaw notification) is the key demo moment.

**Tech Stack:** TypeScript, native `fetch`, Vitest

**Spec:** `docs/specs/2026-03-21-lattice-design.md` (section: OpenClaw Adapter)

**Depends on:** Phase 2a Task 4 (adapter loading pattern in `main.ts`)

---

## File Structure

```
packages/adapters/openclaw/
├── src/
│   ├── openclaw-adapter.ts   # LatticeAdapter implementation
│   └── index.ts              # Re-exports
├── tests/
│   └── openclaw-adapter.test.ts
├── package.json
└── tsconfig.json
```

Also modifies:
- `packages/relay/src/main.ts` — add OpenClaw to adapter loading
- `packages/relay/package.json` — add dependency

---

### Task 1: Package Scaffold

**Files:**
- Create: `packages/adapters/openclaw/package.json`
- Create: `packages/adapters/openclaw/tsconfig.json`
- Create: `packages/adapters/openclaw/src/index.ts`

- [ ] **Step 1: Create package.json**

```json
// packages/adapters/openclaw/package.json
{
  "name": "@lattice/adapter-openclaw",
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
// packages/adapters/openclaw/tsconfig.json
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
// packages/adapters/openclaw/src/index.ts
export { createOpenClawAdapter } from "./openclaw-adapter.js";
export type { OpenClawConfig } from "./openclaw-adapter.js";
```

- [ ] **Step 4: Install dependencies**

```bash
npm install
```

- [ ] **Step 5: Commit**

```bash
git add packages/adapters/openclaw/
git commit -m "feat(adapter-openclaw): scaffold package"
```

---

### Task 2: Adapter Tests (TDD)

**Files:**
- Create: `packages/adapters/openclaw/tests/openclaw-adapter.test.ts`

We mock `globalThis.fetch` to test the adapter without a running OpenClaw gateway.

- [ ] **Step 1: Write the test file**

```typescript
// packages/adapters/openclaw/tests/openclaw-adapter.test.ts
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
        json: () => Promise.resolve({
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
        json: () => Promise.resolve({
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd packages/adapters/openclaw && npx vitest run
```

Expected: FAIL — `openclaw-adapter.ts` does not exist yet.

- [ ] **Step 3: Commit failing tests**

```bash
git add packages/adapters/openclaw/tests/openclaw-adapter.test.ts
git commit -m "test(adapter-openclaw): add failing tests for adapter implementation"
```

---

### Task 3: Adapter Implementation

**Files:**
- Create: `packages/adapters/openclaw/src/openclaw-adapter.ts`

- [ ] **Step 1: Implement the adapter**

```typescript
// packages/adapters/openclaw/src/openclaw-adapter.ts
import type {
  LatticeAdapter,
  AgentCard,
  Task,
  TaskStatusUpdate,
  Artifact,
} from "@lattice/adapter-base";

export interface OpenClawConfig {
  gatewayUrl: string;
  gatewayToken: string;
}

const AGENT_CARD: AgentCard = {
  name: "openclaw",
  description: "OpenClaw — multi-tool AI agent for messaging, scheduling, and web tasks",
  url: "http://localhost:3100/a2a/agents/openclaw",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
  skills: [
    { id: "messaging", name: "Messaging", description: "Send messages via Telegram, Slack, etc.", tags: ["message", "send", "notify", "telegram", "slack"] },
    { id: "scheduling", name: "Scheduling", description: "Schedule tasks and reminders", tags: ["schedule", "reminder", "calendar", "timer"] },
    { id: "web-browsing", name: "Web Browsing", description: "Browse and extract web content", tags: ["browse", "web", "search", "scrape", "fetch"] },
    { id: "file-management", name: "File Management", description: "Manage files and documents", tags: ["file", "document", "upload", "download"] },
  ],
  authentication: { schemes: ["bearer"] },
};

interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

function taskHistoryToChatMessages(task: Task): ChatMessage[] {
  return task.history.map((msg) => ({
    role: msg.role === "agent" ? "assistant" as const : "user" as const,
    content: msg.parts
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!)
      .join("\n"),
  }));
}

export function createOpenClawAdapter(config: OpenClawConfig): LatticeAdapter {
  const { gatewayUrl, gatewayToken } = config;

  return {
    getAgentCard(): AgentCard {
      return AGENT_CARD;
    },

    async executeTask(task: Task): Promise<Task> {
      const messages = taskHistoryToChatMessages(task);

      let responseText: string;
      try {
        const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${gatewayToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages }),
        });

        if (!response.ok) {
          return {
            ...task,
            status: "failed",
            artifacts: [{ name: "error", parts: [{ type: "text", text: `OpenClaw gateway error: ${response.status} ${response.statusText}` }] }],
          };
        }

        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        responseText = data.choices?.[0]?.message?.content ?? "";
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
        parts: [{ type: "text", text: responseText }],
      };

      return { ...task, status: "completed", artifacts: [artifact] };
    },

    async *streamTask(task: Task): AsyncGenerator<TaskStatusUpdate> {
      // OpenClaw doesn't support streaming — execute and yield result
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
        const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${gatewayToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messages: [{ role: "user", content: "ping" }] }),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/adapters/openclaw && npx vitest run
```

Expected: All tests PASS.

- [ ] **Step 3: Commit**

```bash
git add packages/adapters/openclaw/src/
git commit -m "feat(adapter-openclaw): implement LatticeAdapter with gateway REST client"
```

---

### Task 4: Register in Relay main.ts

**Files:**
- Modify: `packages/relay/src/main.ts`
- Modify: `packages/relay/package.json`

**Note:** The current `main.ts` has no adapter loading logic. This task introduces the `loadAdapters()` pattern. If Phase 2a has already landed, it will already have this structure — in that case, just add the OpenClaw block inside the existing `loadAdapters()`. The full replacement below is idempotent and includes the Claude Code adapter block as well (it will only load if `@lattice/adapter-claude-code` is installed).

- [ ] **Step 1: Add dependency to relay**

Add to `packages/relay/package.json` dependencies:

```json
"@lattice/adapter-openclaw": "*"
```

- [ ] **Step 2: Replace main.ts with adapter loading support**

If `main.ts` already has a `loadAdapters()` function (from Phase 2a), just add the OpenClaw block inside it. Otherwise, replace the entire file:

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

  if (adapters["openclaw"]?.enabled) {
    try {
      const { createOpenClawAdapter } = await import("@lattice/adapter-openclaw");
      const gatewayUrl = adapters["openclaw"].gatewayUrl ?? "http://localhost:18789";
      const gatewayToken = adapters["openclaw"].gatewayToken?.replace("${OPENCLAW_GATEWAY_TOKEN}", process.env.OPENCLAW_GATEWAY_TOKEN ?? "") ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
      registry.register(createOpenClawAdapter({ gatewayUrl, gatewayToken }));
      console.log("  ✓ openclaw adapter loaded");
    } catch (err) {
      console.error("  ✗ openclaw adapter failed to load:", err instanceof Error ? err.message : err);
    }
  }

  // Future adapters (2c) will be added here:
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

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/relay/src/main.ts packages/relay/package.json
git commit -m "feat(relay): add adapter auto-loading from config with openclaw support"
```
