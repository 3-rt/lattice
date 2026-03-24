# Non-Technical Friendly UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Lattice approachable for first-time users by surfacing clear reasons when agents are offline, translating raw errors to plain English, and improving startup output.

**Architecture:** A `HealthCheckResult` union type (`boolean | { ok, reason }`) keeps the adapter interface backwards-compatible. The registry normalizes both forms and stores `statusReason` in memory (not DB). An error translation layer in the relay maps known error patterns to friendly messages before returning tasks. The dashboard shows offline reasons on agent cards and a "Show details" toggle on failed tasks.

**Tech Stack:** TypeScript, Vitest, React + Tailwind (dashboard)

**Spec:** `docs/superpowers/specs/2026-03-24-non-technical-friendly-ux-design.md`

---

## File Structure

```
packages/adapters/base/src/
  types.ts              # MODIFY — add HealthCheckResult, Artifact.detail, SSE reason
  adapter.interface.ts  # MODIFY — healthCheck return type

packages/relay/src/
  error-messages.ts     # NEW — error pattern → friendly message mapping
  registry.ts           # MODIFY — statusReason, normalize health check result
  server.ts             # MODIFY — include statusReason in /api/agents response
  task-manager.ts       # MODIFY — apply error translation to failed tasks
  main.ts               # MODIFY — pre-flight checks, improved startup output

packages/relay/tests/
  error-messages.test.ts  # NEW
  registry.test.ts        # MODIFY — statusReason + HealthCheckResult tests
  server.test.ts          # MODIFY — statusReason in API response

packages/adapters/claude-code/src/
  claude-code-adapter.ts  # MODIFY — healthCheck returns { ok, reason }

packages/adapters/openclaw/src/
  openclaw-adapter.ts     # MODIFY — healthCheck returns { ok, reason }

packages/adapters/codex/src/
  codex-adapter.ts        # MODIFY — healthCheck returns { ok, reason }

packages/dashboard/src/
  lib/api.ts              # MODIFY — add statusReason to AgentInfo, detail to artifact type
  store/lattice-store.ts  # MODIFY — pass reason through on agent:status events
  components/agents/agent-card.tsx  # MODIFY — amber warning box for offline agents
  components/tasks/task-row.tsx     # MODIFY — "Show details" toggle for errors

.env.example              # NEW
```

---

### Task 1: Types — HealthCheckResult, Artifact.detail, SSE reason

**Files:**
- Modify: `packages/adapters/base/src/types.ts`
- Modify: `packages/adapters/base/src/adapter.interface.ts`

- [ ] **Step 1: Add HealthCheckResult type to types.ts**

Add after the `TaskStatusUpdate` interface (after line 70):

```typescript
export type HealthCheckResult = boolean | { ok: boolean; reason?: string };
```

- [ ] **Step 2: Add detail field to Artifact interface**

Change the `Artifact` interface (line 60-63) from:

```typescript
export interface Artifact {
  name: string;
  parts: Part[];
}
```

to:

```typescript
export interface Artifact {
  name: string;
  parts: Part[];
  detail?: string;
}
```

- [ ] **Step 3: Add reason to agent:status SSE event type**

Change line 75 from:

```typescript
| { type: "agent:status"; agentName: string; status: string }
```

to:

```typescript
| { type: "agent:status"; agentName: string; status: string; reason?: string }
```

- [ ] **Step 4: Update adapter interface healthCheck return type**

Change `adapter.interface.ts` line 7 from:

```typescript
healthCheck(): Promise<boolean>;
```

to:

```typescript
healthCheck(): Promise<HealthCheckResult>;
```

And add the import at the top:

```typescript
import type { AgentCard, Task, TaskStatusUpdate, HealthCheckResult } from "./types.js";
```

- [ ] **Step 5: Rebuild adapter-base**

Run: `cd packages/adapters/base && npm run build`
Expected: Build success

- [ ] **Step 6: Commit**

```bash
git add packages/adapters/base/
git commit -m "feat(types): add HealthCheckResult, Artifact.detail, SSE reason field"
```

---

### Task 2: Error Translation Layer

**Files:**
- Create: `packages/relay/src/error-messages.ts`
- Create: `packages/relay/tests/error-messages.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/relay/tests/error-messages.test.ts
import { describe, it, expect } from "vitest";
import { translateError } from "../src/error-messages.js";

describe("translateError", () => {
  it("should translate 'missing scope' errors", () => {
    const result = translateError("missing scope: operator.write");
    expect(result.message).toContain("doesn't have permission");
    expect(result.message).toContain("operator.write");
    expect(result.detail).toBe("missing scope: operator.write");
  });

  it("should translate ENOENT errors", () => {
    const result = translateError("spawn claude ENOENT");
    expect(result.message).toContain("CLI tool isn't installed");
    expect(result.detail).toBe("spawn claude ENOENT");
  });

  it("should translate connection timeout errors", () => {
    const result = translateError("OpenClaw gateway connection timeout");
    expect(result.message).toContain("Couldn't reach");
    expect(result.detail).toBe("OpenClaw gateway connection timeout");
  });

  it("should translate ECONNREFUSED errors", () => {
    const result = translateError("connect ECONNREFUSED 127.0.0.1:18789");
    expect(result.message).toContain("Connection refused");
    expect(result.detail).toBe("connect ECONNREFUSED 127.0.0.1:18789");
  });

  it("should translate rate limit errors", () => {
    const result = translateError("rate limit exceeded");
    expect(result.message).toContain("rate limit");
    expect(result.detail).toBe("rate limit exceeded");
  });

  it("should translate auth errors", () => {
    const result = translateError("unauthorized: invalid token");
    expect(result.message).toContain("Authentication failed");
    expect(result.detail).toBe("unauthorized: invalid token");
  });

  it("should translate openclaw response timeout", () => {
    const result = translateError("OpenClaw response timed out");
    expect(result.message).toContain("too long to respond");
    expect(result.detail).toBe("OpenClaw response timed out");
  });

  it("should translate openclaw not connected", () => {
    const result = translateError("OpenClaw gateway not connected");
    expect(result.message).toContain("Lost connection");
    expect(result.detail).toBe("OpenClaw gateway not connected");
  });

  it("should translate claude exit code errors", () => {
    const result = translateError("claude exited with code 1");
    expect(result.message).toContain("Claude encountered an error");
    expect(result.detail).toBe("claude exited with code 1");
  });

  it("should pass through unknown errors unchanged", () => {
    const result = translateError("something completely unknown");
    expect(result.message).toBe("something completely unknown");
    expect(result.detail).toBeUndefined();
  });

  it("should handle empty string", () => {
    const result = translateError("");
    expect(result.message).toBe("");
    expect(result.detail).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/relay/tests/error-messages.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement error-messages.ts**

```typescript
// packages/relay/src/error-messages.ts

interface TranslatedError {
  /** Friendly message for the user */
  message: string;
  /** Original raw error (present only when translation was applied) */
  detail?: string;
}

const ERROR_PATTERNS: Array<{ pattern: RegExp; template: string }> = [
  {
    pattern: /missing scope:\s*(\S+)/i,
    template: "The agent doesn't have permission to do this. An admin needs to grant the '$1' scope.",
  },
  {
    pattern: /ENOENT/,
    template: "The agent's CLI tool isn't installed on this machine.",
  },
  {
    pattern: /OpenClaw response timed out/i,
    template: "OpenClaw took too long to respond. The task may have been too complex.",
  },
  {
    pattern: /OpenClaw gateway not connected/i,
    template: "Lost connection to the OpenClaw gateway. It may have restarted.",
  },
  {
    pattern: /connection timeout/i,
    template: "Couldn't reach the agent's backend service. It may be down or unreachable.",
  },
  {
    pattern: /ECONNREFUSED/,
    template: "Connection refused. The agent's backend isn't running.",
  },
  {
    pattern: /claude exited with code/i,
    template: "Claude encountered an error. Check that the Claude CLI is authenticated and working.",
  },
  {
    pattern: /rate limit/i,
    template: "The agent hit a rate limit. Wait a moment and try again.",
  },
  {
    pattern: /\b(?:auth|unauthorized|forbidden)\b/i,
    template: "Authentication failed. Check the agent's API key or token.",
  },
];

export function translateError(raw: string): TranslatedError {
  if (!raw) return { message: raw };

  for (const { pattern, template } of ERROR_PATTERNS) {
    const match = raw.match(pattern);
    if (match) {
      const message = template.replace(/\$(\d+)/g, (_, i) => match[Number(i)] ?? "");
      return { message, detail: raw };
    }
  }

  return { message: raw };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/relay/tests/error-messages.test.ts`
Expected: All 11 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/error-messages.ts packages/relay/tests/error-messages.test.ts
git commit -m "feat(relay): add error translation layer for friendly messages"
```

---

### Task 3: Registry — statusReason and HealthCheckResult normalization

**Files:**
- Modify: `packages/relay/src/registry.ts`
- Modify: `packages/relay/tests/registry.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/relay/tests/registry.test.ts` after the last existing test (after line 82):

```typescript
  it("should store statusReason when health check returns { ok: false, reason }", async () => {
    const adapter = createMockAdapter("claude-code");
    (adapter.healthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      reason: "CLI not found",
    });
    registry.register(adapter);
    await registry.runHealthChecks();
    const entry = registry.listAgents().find((a) => a.name === "claude-code");
    expect(entry?.status).toBe("offline");
    expect(entry?.statusReason).toBe("CLI not found");
  });

  it("should clear statusReason when agent comes back online", async () => {
    const adapter = createMockAdapter("claude-code");
    const mockHealthCheck = adapter.healthCheck as ReturnType<typeof vi.fn>;

    // First: go offline with a reason
    mockHealthCheck.mockResolvedValue({ ok: false, reason: "CLI not found" });
    registry.register(adapter);
    await registry.runHealthChecks();
    expect(registry.listAgents()[0].statusReason).toBe("CLI not found");

    // Then: come back online
    mockHealthCheck.mockResolvedValue(true);
    await registry.runHealthChecks();
    const entry = registry.listAgents()[0];
    expect(entry.status).toBe("online");
    expect(entry.statusReason).toBeUndefined();
  });

  it("should handle boolean health check return (backwards compat)", async () => {
    const adapter = createMockAdapter("claude-code");
    (adapter.healthCheck as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    registry.register(adapter);
    await registry.runHealthChecks();
    const entry = registry.listAgents()[0];
    expect(entry.status).toBe("offline");
    expect(entry.statusReason).toBeUndefined();
  });

  it("should include reason in agent:status SSE event", async () => {
    const handler = vi.fn();
    bus.on("agent:status", handler);
    const adapter = createMockAdapter("claude-code");
    (adapter.healthCheck as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      reason: "Gateway unreachable",
    });
    registry.register(adapter);
    await registry.runHealthChecks();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "agent:status",
        agentName: "claude-code",
        status: "offline",
        reason: "Gateway unreachable",
      })
    );
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/relay/tests/registry.test.ts`
Expected: FAIL — `statusReason` is undefined, events missing `reason`

- [ ] **Step 3: Update registry.ts**

Replace the entire file `packages/relay/src/registry.ts` with:

```typescript
import type { LatticeAdapter, AgentCard, HealthCheckResult } from "@lattice/adapter-base";
import type { LatticeDB } from "./db.js";
import type { LatticeEventBus } from "./event-bus.js";

export interface AgentEntry {
  name: string;
  card: AgentCard;
  adapter: LatticeAdapter;
  status: "online" | "offline";
  statusReason?: string;
}

export interface LatticeRegistry {
  register(adapter: LatticeAdapter): void;
  deregister(name: string): void;
  getAdapter(name: string): LatticeAdapter | undefined;
  getAgentCard(name: string): AgentCard | undefined;
  listAgents(): AgentEntry[];
  getOnlineAgents(): AgentEntry[];
  runHealthChecks(): Promise<void>;
}

function normalizeHealthCheck(result: HealthCheckResult): { ok: boolean; reason?: string } {
  if (typeof result === "boolean") return { ok: result };
  return { ok: result.ok, reason: result.reason };
}

export function createRegistry(db: LatticeDB, eventBus: LatticeEventBus): LatticeRegistry {
  const agents = new Map<string, AgentEntry>();

  return {
    register(adapter) {
      const card = adapter.getAgentCard();
      const entry: AgentEntry = { name: card.name, card, adapter, status: "online" };
      agents.set(card.name, entry);
      db.upsertAgent(card.name, card);
      eventBus.emit({ type: "agent:registered", agent: card });
    },
    deregister(name) {
      agents.delete(name);
      db.deleteAgent(name);
      eventBus.emit({ type: "agent:deregistered", agentName: name });
    },
    getAdapter(name) { return agents.get(name)?.adapter; },
    getAgentCard(name) { return agents.get(name)?.card; },
    listAgents() { return [...agents.values()]; },
    getOnlineAgents() { return [...agents.values()].filter((a) => a.status === "online"); },
    async runHealthChecks() {
      for (const [name, entry] of agents) {
        try {
          const result = await entry.adapter.healthCheck();
          const { ok, reason } = normalizeHealthCheck(result);
          const newStatus = ok ? "online" : "offline";
          if (newStatus !== entry.status || (newStatus === "offline" && entry.statusReason !== reason)) {
            entry.status = newStatus;
            entry.statusReason = ok ? undefined : reason;
            db.updateAgentStatus(name, newStatus);
            eventBus.emit({
              type: "agent:status",
              agentName: name,
              status: newStatus,
              ...(reason && !ok ? { reason } : {}),
            });
          }
        } catch (err) {
          const reason = err instanceof Error ? err.message : undefined;
          if (entry.status !== "offline" || entry.statusReason !== reason) {
            entry.status = "offline";
            entry.statusReason = reason;
            db.updateAgentStatus(name, "offline");
            eventBus.emit({
              type: "agent:status",
              agentName: name,
              status: "offline",
              ...(reason ? { reason } : {}),
            });
          }
        }
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/relay/tests/registry.test.ts`
Expected: All 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/registry.ts packages/relay/tests/registry.test.ts
git commit -m "feat(registry): add statusReason and normalize HealthCheckResult"
```

---

### Task 4: Server — include statusReason in API response

**Files:**
- Modify: `packages/relay/src/server.ts`
- Modify: `packages/relay/tests/server.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `packages/relay/tests/server.test.ts` inside the `GET /api/agents` describe block (after line 59):

```typescript
    it("should include statusReason when agent is offline", async () => {
      const adapter = createMockAdapter("claude-code", ["code"]);
      registry.register(adapter);
      // Simulate offline with reason by directly setting entry
      const entry = registry.listAgents()[0];
      entry.status = "offline";
      entry.statusReason = "CLI not found";
      const res = await request(app).get("/api/agents");
      expect(res.body[0].statusReason).toBe("CLI not found");
    });

    it("should omit statusReason when agent is online", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      const res = await request(app).get("/api/agents");
      expect(res.body[0].statusReason).toBeUndefined();
    });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/relay/tests/server.test.ts`
Expected: FAIL — `statusReason` not in response

- [ ] **Step 3: Update server.ts GET /api/agents handler**

Change `server.ts` lines 24-31 from:

```typescript
  app.get("/api/agents", (_req, res) => {
    const agents = registry.listAgents().map((a) => ({
      name: a.name,
      status: a.status,
      card: a.card,
    }));
    res.json(agents);
  });
```

to:

```typescript
  app.get("/api/agents", (_req, res) => {
    const agents = registry.listAgents().map((a) => ({
      name: a.name,
      status: a.status,
      card: a.card,
      ...(a.statusReason ? { statusReason: a.statusReason } : {}),
    }));
    res.json(agents);
  });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/relay/tests/server.test.ts`
Expected: All 12 tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/server.ts packages/relay/tests/server.test.ts
git commit -m "feat(server): include statusReason in /api/agents response"
```

---

### Task 5: Task Manager — apply error translation to failed tasks

**Files:**
- Modify: `packages/relay/src/task-manager.ts`

- [ ] **Step 1: Add import at top of task-manager.ts**

Add after line 7 (`import { categorize } from "./categorizer.js";`):

```typescript
import { translateError } from "./error-messages.js";
```

- [ ] **Step 2: Add error translation helper**

Add after the `DEFAULT_TIMEOUT_MS` constant (after line 9):

```typescript
function translateTaskArtifacts(task: Task): Task {
  if (task.status !== "failed") return task;
  const translated = task.artifacts.map((artifact) => {
    if (artifact.name !== "error") return artifact;
    const rawText = artifact.parts[0]?.text;
    if (!rawText) return artifact;
    const { message, detail } = translateError(rawText);
    return {
      ...artifact,
      parts: [{ ...artifact.parts[0], text: message }],
      ...(detail ? { detail } : {}),
    };
  });
  return { ...task, artifacts: translated };
}
```

- [ ] **Step 3: Apply translation in executeTask before returning failed tasks**

There are three return points for failed tasks in `executeTask()`. Wrap each in `translateTaskArtifacts()`:

1. Line ~110 (routing failure): change `return failedTask;` to `return translateTaskArtifacts(failedTask);`
2. Line ~133 (adapter not found): change `return failedTask;` to `return translateTaskArtifacts(failedTask);`
3. Line ~162 (execution error): change `return failedTask;` to `return translateTaskArtifacts(failedTask);`

Also translate tasks where adapters return with status "failed" (returned, not thrown):

4. **Before** line 166 (the success path `const latencyMs`), add an early-return for adapter-returned failures. This must come **before** the success-path DB write to avoid double-counting routing stats:

```typescript
      // If the adapter returned a failed task (not thrown), also translate
      if (resultTask.status === "failed") {
        db.updateTask(taskId, {
          status: "failed",
          result: JSON.stringify(resultTask.artifacts ?? []),
          latency_ms: latencyMs,
        });
        db.updateRoutingStats(agentName, category, false, latencyMs, 0);
        const failedTask = rowToTask(db.getTask(taskId)!);
        eventBus.emit({ type: "task:failed", taskId, error: failedTask.artifacts[0]?.parts[0]?.text ?? "Unknown error" });
        return translateTaskArtifacts(failedTask);
      }
```

- [ ] **Step 4: Run all tests to verify nothing broke**

Run: `npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/task-manager.ts
git commit -m "feat(task-manager): apply error translation to failed tasks"
```

---

### Task 6: Adapter Health Checks — return { ok, reason }

**Files:**
- Modify: `packages/adapters/claude-code/src/claude-code-adapter.ts`
- Modify: `packages/adapters/openclaw/src/openclaw-adapter.ts`
- Modify: `packages/adapters/codex/src/codex-adapter.ts`
- Modify: adapter test files

- [ ] **Step 1: Update Claude Code adapter healthCheck**

In `packages/adapters/claude-code/src/claude-code-adapter.ts`, find the `healthCheck` method (lines 261-271). The current code uses `spawn` directly:

```typescript
    async healthCheck(): Promise<boolean> {
      return new Promise((resolve) => {
        const child = spawn(claudeBin(), ["--version"], {
          stdio: ["ignore", "pipe", "ignore"],
        });
        child.on("error", () => resolve(false));
        child.on("close", (code) => resolve(code === 0));
      });
    },
```

Change to:

```typescript
    async healthCheck(): Promise<HealthCheckResult> {
      return new Promise((resolve) => {
        const child = spawn(claudeBin(), ["--version"], {
          stdio: ["ignore", "pipe", "ignore"],
        });
        child.on("error", (err) => {
          const reason = /ENOENT/.test(err.message)
            ? "Claude CLI not found. Install it with: npm install -g @anthropic-ai/claude-code"
            : "Claude CLI exited with an error. Run 'claude --version' to check your setup.";
          resolve({ ok: false, reason });
        });
        child.on("close", (code) => {
          if (code === 0) {
            resolve({ ok: true });
          } else {
            resolve({ ok: false, reason: "Claude CLI exited with an error. Run 'claude --version' to check your setup." });
          }
        });
      });
    },
```

Add `HealthCheckResult` to the import from `@lattice/adapter-base`.

- [ ] **Step 2: Update OpenClaw adapter healthCheck**

In `packages/adapters/openclaw/src/openclaw-adapter.ts`, find the `healthCheck` method and change from:

```typescript
    async healthCheck(): Promise<boolean> {
      try {
        const gw = await getClient();
        return gw.isConnected();
      } catch {
        return false;
      }
    },
```

to:

```typescript
    async healthCheck(): Promise<HealthCheckResult> {
      if (!token) {
        return { ok: false, reason: "Gateway token not configured. Set OPENCLAW_GATEWAY_TOKEN in your environment." };
      }
      try {
        const gw = await getClient();
        if (!gw.isConnected()) {
          return { ok: false, reason: `Can't reach OpenClaw gateway at ${wsUrl}. Check that the gateway is running.` };
        }
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/timeout/i.test(msg)) {
          return { ok: false, reason: `Can't reach OpenClaw gateway at ${wsUrl}. Check that the gateway is running.` };
        }
        if (/rejected|auth|scope/i.test(msg)) {
          return { ok: false, reason: "Gateway rejected the token. Check that your OPENCLAW_GATEWAY_TOKEN has the right permissions." };
        }
        return { ok: false, reason: msg };
      }
    },
```

Add `HealthCheckResult` to the import from `@lattice/adapter-base`.

- [ ] **Step 3: Update Codex adapter healthCheck**

In `packages/adapters/codex/src/codex-adapter.ts`, find the `healthCheck` method and change from:

```typescript
    async healthCheck(): Promise<boolean> {
      try {
        await runCodex(codexPath, ["--version"]);
        return true;
      } catch {
        return false;
      }
    },
```

to:

```typescript
    async healthCheck(): Promise<HealthCheckResult> {
      try {
        await runCodex(codexPath, ["--version"]);
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const reason = /ENOENT/.test(msg)
          ? "Codex CLI not found. Install it from: https://github.com/openai/codex"
          : `Codex CLI error: ${msg}`;
        return { ok: false, reason };
      }
    },
```

Add `HealthCheckResult` to the import from `@lattice/adapter-base`.

- [ ] **Step 4: Update adapter tests for new return type**

In each adapter test file, update the health check tests to expect `{ ok: true }` or `{ ok: false, reason: "..." }` instead of `true`/`false`. The mock adapters in relay tests still return `boolean` (testing backwards compat).

- [ ] **Step 5: Rebuild all adapter packages**

Run: `npm run build`
Expected: Build success

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/adapters/
git commit -m "feat(adapters): health checks return { ok, reason } with friendly messages"
```

---

### Task 7: Startup Pre-flight Checks

**Files:**
- Modify: `packages/relay/src/main.ts`

- [ ] **Step 1: Rewrite loadAdapters with pre-flight checks**

Replace the `loadAdapters` function and startup output in `main.ts` with:

```typescript
async function loadAdapters() {
  const adapters = config.adapters ?? {};

  console.log("\n  Lattice\n");
  console.log("  Adapters:");

  if (adapters["claude-code"]?.enabled) {
    try {
      const { createClaudeCodeAdapter } = await import("@lattice/adapter-claude-code").catch(
        () => import("../../adapters/claude-code/src/index.ts")
      );
      const adapter = createClaudeCodeAdapter();
      registry.register(adapter);
      // Pre-flight: check health immediately
      const result = await adapter.healthCheck();
      const { ok, reason } = typeof result === "boolean" ? { ok: result, reason: undefined } : result;
      if (!ok) {
        const entry = registry.listAgents().find((a) => a.name === "claude-code");
        if (entry) { entry.status = "offline"; entry.statusReason = reason; }
        console.log(`  ⚠ claude-code     ${reason ?? "offline"}`);
      } else {
        console.log("  ✓ claude-code     ready");
      }
    } catch (err) {
      console.log(`  ✗ claude-code     ${err instanceof Error ? err.message : err}`);
    }
  }

  if (adapters["openclaw"]?.enabled) {
    // Pre-flight: check token before even trying to connect
    const gatewayToken =
      adapters["openclaw"].gatewayToken?.replace(
        "${OPENCLAW_GATEWAY_TOKEN}",
        process.env.OPENCLAW_GATEWAY_TOKEN ?? ""
      ) ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? "";

    if (!gatewayToken) {
      console.log("  ⚠ openclaw        OPENCLAW_GATEWAY_TOKEN not set");
      console.log('                    → Set it with: export OPENCLAW_GATEWAY_TOKEN="your-token"');
      // Still register so it shows in dashboard, but mark offline
      try {
        const { createOpenClawAdapter } = await import("@lattice/adapter-openclaw").catch(
          () => import("../../adapters/openclaw/src/index.ts")
        );
        const gatewayUrl = adapters["openclaw"].gatewayUrl ?? "http://localhost:18789";
        const adapter = createOpenClawAdapter({ gatewayUrl, gatewayToken: "" });
        registry.register(adapter);
        const entry = registry.listAgents().find((a) => a.name === "openclaw");
        if (entry) {
          entry.status = "offline";
          entry.statusReason = "Gateway token not configured. Set OPENCLAW_GATEWAY_TOKEN in your environment.";
        }
      } catch { /* ignore */ }
    } else {
      try {
        const { createOpenClawAdapter } = await import("@lattice/adapter-openclaw").catch(
          () => import("../../adapters/openclaw/src/index.ts")
        );
        const gatewayUrl = adapters["openclaw"].gatewayUrl ?? "http://localhost:18789";
        const adapter = createOpenClawAdapter({ gatewayUrl, gatewayToken });
        registry.register(adapter);
        const result = await adapter.healthCheck();
        const { ok, reason } = typeof result === "boolean" ? { ok: result, reason: undefined } : result;
        if (!ok) {
          const entry = registry.listAgents().find((a) => a.name === "openclaw");
          if (entry) { entry.status = "offline"; entry.statusReason = reason; }
          console.log(`  ⚠ openclaw        ${reason ?? "offline"}`);
        } else {
          console.log("  ✓ openclaw        ready");
        }
      } catch (err) {
        console.log(`  ✗ openclaw        ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  if (adapters["codex"]?.enabled) {
    try {
      const { createCodexAdapter } = await import("@lattice/adapter-codex").catch(
        () => import("../../adapters/codex/src/index.ts")
      );
      const codexPath = adapters["codex"].codexPath ?? "codex";
      const adapter = createCodexAdapter({ codexPath });
      registry.register(adapter);
      const result = await adapter.healthCheck();
      const { ok, reason } = typeof result === "boolean" ? { ok: result, reason: undefined } : result;
      if (!ok) {
        const entry = registry.listAgents().find((a) => a.name === "codex");
        if (entry) { entry.status = "offline"; entry.statusReason = reason; }
        console.log(`  ⚠ codex           ${reason ?? "offline"}`);
      } else {
        console.log("  ✓ codex           ready");
      }
    } catch (err) {
      console.log(`  ✗ codex           ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log();
}
```

- [ ] **Step 2: Update the startup output after loadAdapters**

Replace lines 79-99 (the `.then()` block) with:

```typescript
loadAdapters().then(() => {
  const workflowDir = path.resolve(
    process.cwd(),
    config.workflows?.seedDir ?? "workflows"
  );
  const seedResult = seedWorkflows(db, workflowDir);
  if (seedResult.loaded > 0 || seedResult.skipped > 0) {
    console.log("  Workflows:");
    if (seedResult.loaded > 0) console.log(`    ✓ ${seedResult.loaded} workflow(s) loaded`);
    if (seedResult.skipped > 0) console.log(`    ✓ ${seedResult.skipped} existing workflow(s)`);
    for (const error of seedResult.errors) {
      console.log(`    ✗ ${error}`);
    }
    console.log();
  }

  const onlineCount = registry.getOnlineAgents().length;
  const totalCount = registry.listAgents().length;

  app.listen(port, host, () => {
    console.log(`  Relay running at http://${host}:${port}`);
    console.log(`  Agents online: ${onlineCount} of ${totalCount}`);
    console.log();
  });

  setInterval(() => registry.runHealthChecks(), 30_000);
}).catch((err) => {
  console.error("Fatal: failed to load adapters:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add packages/relay/src/main.ts
git commit -m "feat(startup): add pre-flight checks with actionable guidance"
```

---

### Task 8: Dashboard — Agent Card offline warning

**Files:**
- Modify: `packages/dashboard/src/lib/api.ts`
- Modify: `packages/dashboard/src/store/lattice-store.ts`
- Modify: `packages/dashboard/src/components/agents/agent-card.tsx`

- [ ] **Step 1: Add statusReason to AgentInfo type**

In `packages/dashboard/src/lib/api.ts`, add `statusReason` to the `AgentInfo` interface (after line 4):

```typescript
export interface AgentInfo {
  name: string;
  status: string;
  statusReason?: string;  // ADD THIS LINE
  card: {
```

- [ ] **Step 2: Update lattice-store to pass reason on agent:status**

In `packages/dashboard/src/store/lattice-store.ts`, change the `agent:status` handler (line 64-65) from:

```typescript
      case "agent:status":
        state.updateAgent(event.agentName as string, { status: event.status as string });
        break;
```

to:

```typescript
      case "agent:status":
        state.updateAgent(event.agentName as string, {
          status: event.status as string,
          statusReason: (event.reason as string) ?? undefined,
        });
        break;
```

- [ ] **Step 3: Update agent-card.tsx with amber warning box**

Replace `packages/dashboard/src/components/agents/agent-card.tsx` with:

```tsx
import { motion } from "framer-motion";
import { clsx } from "clsx";
import type { AgentInfo } from "../../lib/api.ts";

interface AgentCardProps {
  agent: AgentInfo;
}

export function AgentCard({ agent }: AgentCardProps) {
  const isOnline = agent.status === "online";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={clsx(
        "rounded-lg border bg-gray-900 p-4 transition-shadow",
        isOnline ? "border-gray-700 hover:border-lattice-700 hover:shadow-lg hover:shadow-lattice-900/20" : "border-gray-800 opacity-60"
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-100">{agent.card.name}</h3>
        <div className="flex items-center gap-1.5">
          <div
            className={clsx(
              "h-2 w-2 rounded-full",
              isOnline ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-gray-600"
            )}
          />
          <span className="text-xs text-gray-500">{agent.status}</span>
        </div>
      </div>

      <p className="mt-1 text-xs text-gray-400 line-clamp-2">{agent.card.description}</p>

      {!isOnline && agent.statusReason && (
        <div className="mt-3 rounded border border-amber-900/50 bg-amber-950/30 px-3 py-2">
          <p className="text-xs text-amber-200/80">{agent.statusReason}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-1">
        {agent.card.skills.map((skill) => (
          <span
            key={skill.id}
            className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400"
          >
            {skill.name}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px] text-gray-600">
        <span>v{agent.card.version}</span>
        {agent.card.capabilities.streaming && <span>Streaming</span>}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 4: Run dashboard tests**

Run: `npx vitest run packages/dashboard/`
Expected: All dashboard tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/lib/api.ts packages/dashboard/src/store/lattice-store.ts packages/dashboard/src/components/agents/agent-card.tsx
git commit -m "feat(dashboard): show offline reason on agent cards"
```

---

### Task 9: Dashboard — "Show details" toggle on failed tasks

**Files:**
- Modify: `packages/dashboard/src/lib/api.ts`
- Modify: `packages/dashboard/src/components/tasks/task-row.tsx`
- Modify: `packages/dashboard/src/components/tasks/task-utils.ts`

- [ ] **Step 1: Add detail to artifact type in api.ts**

In `packages/dashboard/src/lib/api.ts`, update the `artifacts` type in `TaskInfo` (line 20) from:

```typescript
  artifacts: Array<{ name: string; parts: Array<{ type: string; text?: string }> }>;
```

to:

```typescript
  artifacts: Array<{ name: string; parts: Array<{ type: string; text?: string }>; detail?: string }>;
```

- [ ] **Step 2: Update task-utils to extract detail**

Read `packages/dashboard/src/components/tasks/task-utils.ts` and add a new helper:

```typescript
export function getTaskErrorDetail(task: TaskInfo): string | undefined {
  if (task.status !== "failed") return undefined;
  const errorArtifact = task.artifacts?.find((a) => a.name === "error");
  return errorArtifact?.detail;
}
```

- [ ] **Step 3: Update task-row.tsx with "Show details" toggle**

In `packages/dashboard/src/components/tasks/task-row.tsx`:

Add import for the new helper:
```typescript
import { getTaskInputText, getTaskOutputText, getTaskErrorDetail } from "./task-utils.ts";
```

Add state for the details toggle inside the `TaskRow` component (after line 22):
```typescript
  const [showDetail, setShowDetail] = useState(false);
  const errorDetail = getTaskErrorDetail(task);
```

After the output `<pre>` block (after line 109), add:

```tsx
              {errorDetail && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowDetail((v) => !v)}
                    className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                  >
                    {showDetail ? "Hide details" : "Show details"}
                  </button>
                  {showDetail && (
                    <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap rounded border border-gray-800 bg-gray-950 p-2 text-[10px] text-gray-600">
                      {errorDetail}
                    </pre>
                  )}
                </div>
              )}
```

- [ ] **Step 4: Run dashboard tests**

Run: `npx vitest run packages/dashboard/`
Expected: All dashboard tests PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/
git commit -m "feat(dashboard): add 'Show details' toggle for failed task errors"
```

---

### Task 10: .env.example and final integration test

**Files:**
- Create: `.env.example`
- Rebuild all packages

- [ ] **Step 1: Create .env.example**

```bash
# .env.example

# OpenClaw gateway authentication token
# Get this from your OpenClaw dashboard → Settings → API Tokens
OPENCLAW_GATEWAY_TOKEN=

# Optional: override CLI paths if not on system PATH
# CLAUDE_BIN=claude
# CODEX_BIN=codex
```

- [ ] **Step 2: Rebuild all packages**

Run: `npm run build`
Expected: Build success

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 4: Manual verification — start relay and check output**

Run: `npx tsx packages/relay/src/main.ts`
Expected: Formatted startup output with ✓/⚠ per adapter, agent count

- [ ] **Step 5: Commit**

```bash
git add .env.example
git commit -m "feat: add .env.example with setup guidance"
```
