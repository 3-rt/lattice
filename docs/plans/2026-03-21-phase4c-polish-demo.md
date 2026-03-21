# Phase 4c: End-to-End Polish & Demo Script Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire together all Lattice subsystems for a seamless end-to-end experience — seed demo workflows on startup, verify every integration point, add developer convenience scripts, write a README, and produce a step-by-step demo script.

**Architecture:** No new subsystems. This phase modifies the relay startup to auto-seed workflows from `workflows/*.json`, adds an integration smoke test that boots the relay and validates every REST endpoint, and produces documentation (README, demo script) that ties the project together.

**Tech Stack:** Node.js, Express, Vitest, TypeScript, npm workspaces

**Spec:** `docs/specs/2026-03-21-lattice-design.md` (section: Demo Script)

---

## File Structure

```
lattice/
├── packages/
│   └── relay/
│       ├── src/
│       │   ├── main.ts                  # MODIFY — add workflow seeding
│       │   └── seed-workflows.ts        # CREATE — workflow JSON loader
│       └── tests/
│           └── seed-workflows.test.ts   # CREATE — unit tests for seeder
├── tests/
│   └── smoke.test.ts                    # CREATE — integration smoke test
├── workflows/
│   ├── bug-fix-pipeline.json            # EXISTS
│   └── code-review.json                 # EXISTS
├── docs/
│   └── demo-script.md                   # CREATE — step-by-step demo guide
├── lattice.config.json                  # MODIFY — enable all adapters
├── README.md                            # CREATE — project README
└── package.json                         # MODIFY — add dev:relay script
```

---

### Task 1: Add Workflow Seeding to Relay Startup

**Files:**
- Create: `packages/relay/src/seed-workflows.ts`
- Create: `packages/relay/tests/seed-workflows.test.ts`
- Modify: `packages/relay/src/main.ts`
- Modify: `packages/relay/src/index.ts`

- [ ] **Step 1: Create `packages/relay/src/seed-workflows.ts`**

This module reads all `*.json` files from a given directory, parses each as a workflow definition, and inserts into the DB if a workflow with the same name does not already exist.

```typescript
// packages/relay/src/seed-workflows.ts
import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { LatticeDB } from "./db.js";

export interface SeedResult {
  loaded: number;
  skipped: number;
  errors: string[];
}

export function seedWorkflows(db: LatticeDB, workflowDir: string): SeedResult {
  const result: SeedResult = { loaded: 0, skipped: 0, errors: [] };

  if (!fs.existsSync(workflowDir)) {
    return result;
  }

  const files = fs.readdirSync(workflowDir).filter((f) => f.endsWith(".json"));

  const existingNames = new Set(db.listWorkflows().map((w) => w.name));

  for (const file of files) {
    const filePath = path.join(workflowDir, file);
    try {
      const raw = fs.readFileSync(filePath, "utf-8");
      const parsed = JSON.parse(raw);

      const name: string | undefined = parsed.name;
      const definition: Record<string, unknown> | undefined = parsed.definition;

      if (!name || !definition) {
        result.errors.push(`${file}: missing "name" or "definition" field`);
        continue;
      }

      if (existingNames.has(name)) {
        result.skipped++;
        continue;
      }

      db.insertWorkflow(uuidv4(), name, definition);
      result.loaded++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${file}: ${msg}`);
    }
  }

  return result;
}
```

- [ ] **Step 2: Add export to `packages/relay/src/index.ts`**

Append the following export to the existing file:

```typescript
export { seedWorkflows } from "./seed-workflows.js";
export type { SeedResult } from "./seed-workflows.js";
```

- [ ] **Step 3: Modify `packages/relay/src/main.ts` to seed workflows after adapter loading**

Add the import at the top of the file:

```typescript
import { seedWorkflows } from "./seed-workflows.js";
```

Inside the `loadAdapters().then(...)` callback, before `app.listen(...)`, add:

```typescript
  // Seed demo workflows from workflows/ directory
  const workflowDir = path.resolve(process.cwd(), "workflows");
  const seedResult = seedWorkflows(db, workflowDir);
  if (seedResult.loaded > 0) {
    console.log(`  Seeded ${seedResult.loaded} workflow(s) from ${workflowDir}`);
  }
  if (seedResult.skipped > 0) {
    console.log(`  Skipped ${seedResult.skipped} existing workflow(s)`);
  }
  for (const err of seedResult.errors) {
    console.error(`  ✗ workflow seed error: ${err}`);
  }
```

- [ ] **Step 4: Create `packages/relay/tests/seed-workflows.test.ts`**

```typescript
// packages/relay/tests/seed-workflows.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { createDatabase } from "../src/db.js";
import { seedWorkflows } from "../src/seed-workflows.js";

describe("seedWorkflows", () => {
  let tmpDir: string;
  let workflowDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lattice-seed-"));
    workflowDir = path.join(tmpDir, "workflows");
    fs.mkdirSync(workflowDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeWorkflow(filename: string, content: Record<string, unknown>) {
    fs.writeFileSync(path.join(workflowDir, filename), JSON.stringify(content));
  }

  it("loads valid workflow JSON files into DB", () => {
    const db = createDatabase(":memory:");
    writeWorkflow("test.json", {
      name: "Test Workflow",
      definition: { nodes: [], edges: [] },
    });

    const result = seedWorkflows(db, workflowDir);

    expect(result.loaded).toBe(1);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(db.listWorkflows()).toHaveLength(1);
    expect(db.listWorkflows()[0].name).toBe("Test Workflow");
  });

  it("skips workflows that already exist by name", () => {
    const db = createDatabase(":memory:");
    writeWorkflow("test.json", {
      name: "Existing",
      definition: { nodes: [], edges: [] },
    });

    seedWorkflows(db, workflowDir);
    const result = seedWorkflows(db, workflowDir);

    expect(result.loaded).toBe(0);
    expect(result.skipped).toBe(1);
    expect(db.listWorkflows()).toHaveLength(1);
  });

  it("reports errors for malformed JSON", () => {
    const db = createDatabase(":memory:");
    fs.writeFileSync(path.join(workflowDir, "bad.json"), "not json");

    const result = seedWorkflows(db, workflowDir);

    expect(result.loaded).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("bad.json");
  });

  it("reports errors for missing name or definition", () => {
    const db = createDatabase(":memory:");
    writeWorkflow("no-name.json", { definition: { nodes: [] } });

    const result = seedWorkflows(db, workflowDir);

    expect(result.loaded).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("no-name.json");
  });

  it("returns empty result for nonexistent directory", () => {
    const db = createDatabase(":memory:");
    const result = seedWorkflows(db, "/tmp/does-not-exist-lattice");

    expect(result.loaded).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("loads multiple workflows and ignores non-JSON files", () => {
    const db = createDatabase(":memory:");
    writeWorkflow("a.json", { name: "A", definition: { nodes: [], edges: [] } });
    writeWorkflow("b.json", { name: "B", definition: { nodes: [], edges: [] } });
    fs.writeFileSync(path.join(workflowDir, "readme.txt"), "ignore me");

    const result = seedWorkflows(db, workflowDir);

    expect(result.loaded).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(db.listWorkflows()).toHaveLength(2);
  });
});
```

- [ ] **Step 5: Commit**

```
feat(relay): add workflow seeding from workflows/ directory on startup
```

---

### Task 2: Write Project README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md` at the project root**

```markdown
# Lattice

**Connect your AI agents. Orchestrate everything.**

Lattice is a unified control plane for AI agent orchestration via the [A2A (Agent-to-Agent) protocol](https://github.com/google/A2A). It provides a relay server, real-time dashboard, CLI, and workflow engine that lets multiple AI agents collaborate on complex tasks.

<!-- Screenshot: Dashboard Overview -->
<!-- ![Lattice Dashboard](docs/images/dashboard-overview.png) -->

## Architecture

```
┌─────────────┐     ┌─────────────────────┐     ┌──────────────┐
│  Dashboard   │────▶│    Lattice Relay     │◀────│     CLI      │
│  (React)     │ SSE │  (Express + SQLite)  │REST │ (Commander)  │
└─────────────┘     └─────────┬───────────┘     └──────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
       ┌────────────┐  ┌────────────┐  ┌────────────┐
       │ Claude Code │  │  OpenClaw  │  │   Codex    │
       │  Adapter    │  │  Adapter   │  │  Adapter   │
       └────────────┘  └────────────┘  └────────────┘
```

- **Relay** — Node.js + Express JSON-RPC server with SQLite persistence, agent registry, skill-matching router (with Thompson Sampling learned routing), task manager, workflow DAG engine, and SSE event stream.
- **Adapters** — In-process TypeScript modules wrapping Claude Code SDK, OpenClaw gateway API, and Codex CLI.
- **Dashboard** — React + Vite + Tailwind + shadcn/ui with live agent overview, flow visualization (React Flow), task history, routing stats, and workflow editor.
- **CLI** — Commander.js thin wrapper over the relay REST API.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Run all tests
npx vitest run

# 3. Start the relay server (port 3100)
npm run dev:relay

# 4. Start the dashboard (port 3200) — in a separate terminal
npm run dev:dashboard

# 5. Or start both at once
npm run dev:all
```

### Using the CLI

```bash
# List registered agents
npx lattice agents

# Send a task to an agent
npx lattice send "Fix the bug in auth.ts"

# Send to a specific agent
npx lattice send --agent claude-code "Review this PR"

# Check task status
npx lattice status <task-id>

# List workflows
npx lattice workflow list

# Run a workflow
npx lattice workflow run <workflow-id>

# View routing statistics
npx lattice routing
```

## API Reference

| Method | Endpoint                    | Description                          |
|--------|-----------------------------|--------------------------------------|
| GET    | `/api/agents`               | List agents and their status         |
| POST   | `/api/tasks`                | Create a task `{ text, agent?, execute? }` |
| GET    | `/api/tasks`                | List tasks (filterable `?status=`)   |
| GET    | `/api/tasks/:id`            | Get task detail                      |
| POST   | `/api/tasks/:id/cancel`     | Cancel a running task                |
| POST   | `/api/tasks/:id/input`      | Provide input for input-required task|
| GET    | `/api/routing/stats`        | Router performance statistics        |
| GET    | `/api/workflows`            | List workflows                       |
| POST   | `/api/workflows`            | Create a workflow                    |
| POST   | `/api/workflows/:id/run`    | Trigger a workflow run               |
| GET    | `/api/workflows/:id/runs`   | List runs for a workflow             |
| GET    | `/api/events`               | SSE stream (real-time events)        |

### SSE Event Types

```
agent:registered, agent:deregistered, agent:status
task:created, task:routed, task:progress, task:completed, task:failed, task:canceled, task:input-required
workflow:started, workflow:step, workflow:completed
message:sent, message:received
```

## Configuration

All configuration lives in `lattice.config.json` at the project root:

```json
{
  "relay": { "port": 3100, "host": "localhost" },
  "adapters": {
    "claude-code": { "enabled": true },
    "openclaw": { "enabled": true, "gatewayUrl": "http://localhost:18789" },
    "codex": { "enabled": true, "codexPath": "codex" }
  },
  "dashboard": { "port": 3200 },
  "routing": { "strategy": "learned", "fallback": "round-robin" }
}
```

## Project Structure

```
lattice/
├── packages/
│   ├── adapters/
│   │   ├── base/           # A2A types + LatticeAdapter interface
│   │   ├── claude-code/    # Claude Code SDK wrapper
│   │   ├── openclaw/       # OpenClaw gateway wrapper
│   │   └── codex/          # Codex CLI wrapper
│   ├── relay/              # Core relay server
│   ├── cli/                # CLI tool
│   └── dashboard/          # React dashboard
├── workflows/              # Pre-built workflow JSON files
├── docs/
│   ├── specs/              # Design spec
│   └── plans/              # Implementation plans
├── lattice.config.json
└── package.json
```

## Demo Workflows

Lattice ships with pre-built workflows in the `workflows/` directory that are auto-seeded on startup:

- **Bug Fix Pipeline** — Describe a bug, Claude Code fixes it, Codex reviews the fix, OpenClaw notifies the team.
- **Code Review** — Point to a PR, Claude Code reviews, OpenClaw sends a summary.

## Tech Stack

- **Runtime:** Node.js + TypeScript
- **Server:** Express + JSON-RPC 2.0
- **Database:** SQLite via better-sqlite3
- **Dashboard:** React + Vite + Tailwind + shadcn/ui + React Flow + Framer Motion + Zustand
- **CLI:** Commander.js
- **Build:** tsup, npm workspaces
- **Tests:** Vitest

## License

MIT
```

- [ ] **Step 2: Commit**

```
docs: add project README with architecture, quick start, and API reference
```

---

### Task 3: Verify and Fix `lattice.config.json`

**Files:**
- Modify: `lattice.config.json`
- Modify: `package.json`

- [ ] **Step 1: Update `lattice.config.json` to enable all three adapters and add workflow seeding config**

The current config has `codex.enabled: false`. Set it to `true` so the demo has all three agents. Also add a `workflows` section pointing to the workflows directory.

```json
{
  "relay": {
    "port": 3100,
    "host": "localhost"
  },
  "adapters": {
    "claude-code": {
      "enabled": true,
      "claudePath": "claude"
    },
    "openclaw": {
      "enabled": true,
      "gatewayUrl": "http://localhost:18789",
      "gatewayToken": "${OPENCLAW_GATEWAY_TOKEN}"
    },
    "codex": {
      "enabled": true,
      "codexPath": "codex"
    }
  },
  "dashboard": {
    "port": 3200
  },
  "routing": {
    "strategy": "learned",
    "fallback": "round-robin"
  },
  "workflows": {
    "seedDir": "workflows"
  }
}
```

- [ ] **Step 2: Add `dev:relay` convenience alias to root `package.json`**

The root `package.json` already has `dev`, `dev:dashboard`, and `dev:all`. Add a `dev:relay` alias that explicitly names the relay workspace, and a `start` script for the demo:

```json
{
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "start": "npx tsx packages/relay/src/main.ts",
    "dev:relay": "npm run dev --workspace=packages/relay",
    "dev:dashboard": "npm run dev --workspace=packages/dashboard",
    "dev:all": "npm run dev --workspace=packages/relay & npm run dev --workspace=packages/dashboard",
    "dev": "npm run dev --workspace=packages/relay"
  }
}
```

- [ ] **Step 3: Commit**

```
chore: enable all adapters in config, add dev:relay and start scripts
```

---

### Task 4: Write Demo Script Document

**Files:**
- Create: `docs/demo-script.md`

- [ ] **Step 1: Create `docs/demo-script.md`**

```markdown
# Lattice Demo Script

This is a step-by-step walkthrough of Lattice's capabilities. It assumes all adapters are installed and API keys are configured.

## Prerequisites

1. Clone the repo and install dependencies:
   ```bash
   npm install
   ```

2. Set environment variables for adapter credentials:
   ```bash
   export OPENCLAW_GATEWAY_TOKEN="your-token-here"
   ```

3. Ensure the OpenClaw gateway is running at `http://localhost:18789` (or update `lattice.config.json`).

4. Ensure `claude` and `codex` CLIs are installed and available on PATH.

---

## Part 1: Boot the System

### Step 1 — Start the relay server

```bash
npm start
```

Expected output:
```
  ✓ claude-code adapter loaded
  ✓ openclaw adapter loaded
  ✓ codex adapter loaded
  Seeded 2 workflow(s) from /path/to/lattice/workflows
Lattice relay server running at http://localhost:3100
SSE endpoint: http://localhost:3100/api/events
Agents registered: 3
```

### Step 2 — Start the dashboard (separate terminal)

```bash
npm run dev:dashboard
```

### Step 3 — Open the dashboard

Navigate to [http://localhost:3200](http://localhost:3200) in your browser.

---

## Part 2: Agent Overview

### Step 4 — Verify three agents are registered

The Agent Overview page shows three agent cards:
- **Claude Code** — coding tasks (TypeScript, Python, etc.)
- **OpenClaw** — gateway tasks (notifications, API calls)
- **Codex** — code review and analysis

Each card displays the agent name, status (online), supported skills, and last heartbeat.

You can also verify from the CLI:
```bash
npx lattice agents
```

---

## Part 3: Single Task Dispatch

### Step 5 — Dispatch a task from the dashboard

Type in the task dispatch bar at the top:
```
Fix the bug in auth.ts
```

Press Enter (or click Send).

### Step 6 — Watch the flow visualization

Switch to the **Flow** tab. Observe:
- The task node appears
- The learned router selects an agent (likely Claude Code based on skill match)
- An animated edge connects the task to the agent node
- Progress events stream through as the agent works

### Step 7 — View task completion

Switch to **Task History**. The task appears with:
- Status: `completed`
- Assigned agent: `claude-code`
- Latency and routing reason
- Result artifacts (the fix)

CLI equivalent:
```bash
npx lattice send "Fix the bug in auth.ts"
npx lattice status <task-id>
```

---

## Part 4: Workflow Execution

### Step 8 — Open the Workflow Editor

Switch to the **Workflows** tab. Two pre-loaded workflows appear:
- Bug Fix Pipeline
- Code Review

### Step 9 — Inspect the Bug Fix Pipeline

Click on **Bug Fix Pipeline**. The workflow editor shows the DAG:
```
Describe Bug → Fix Bug (Claude Code) → Review Fix (Codex) → Review Passed? → Notify Team (OpenClaw)
```

### Step 10 — Trigger the workflow

Click **Run** on the Bug Fix Pipeline. Provide the input:
```
There is a null pointer exception in auth.ts line 42 when the user token is expired.
```

### Step 11 — Watch agents coordinate in the flow visualization

Switch to the **Flow** tab. Observe the workflow execution:
1. The "Describe Bug" node activates, routes to an agent
2. Output flows to "Fix Bug", Claude Code picks it up
3. Fix output flows to "Review Fix", Codex reviews
4. Condition node checks review status
5. "Notify Team" sends summary via OpenClaw
6. Each edge animates as data flows between nodes

CLI equivalent:
```bash
npx lattice workflow list
npx lattice workflow run <workflow-id>
```

---

## Part 5: Routing Intelligence

### Step 12 — View routing statistics

Switch to the **Routing Stats** tab. Observe:
- Per-agent success/failure counts
- Average latency per category
- Thompson Sampling convergence — the router learns which agents perform best for each task category
- Over multiple tasks, the distribution shifts toward the best-performing agent per skill

CLI equivalent:
```bash
npx lattice routing
```

---

## Part 6: CLI Walkthrough (Optional)

Run through the core CLI commands:

```bash
# List agents
npx lattice agents

# Send a task
npx lattice send "Summarize the changes in the last 5 commits"

# Check status
npx lattice status <task-id>

# List workflows
npx lattice workflow list

# Run a workflow
npx lattice workflow run <workflow-id>

# View routing stats
npx lattice routing
```

---

## Talking Points

- **A2A Protocol:** Lattice uses the A2A (Agent-to-Agent) protocol, a standard for agent interoperability. Any A2A-compatible agent can plug in.
- **Learned Routing:** The Thompson Sampling router learns which agent is best for which task category, improving over time without manual configuration.
- **Workflow DAG Engine:** Workflows are directed acyclic graphs with topological sort execution, parallel branches, conditional nodes, and data mapping between steps.
- **Real-time SSE:** All state changes stream to the dashboard via Server-Sent Events with Last-Event-ID replay support.
- **Progressive Architecture:** Adapters start as in-process TypeScript modules. Extracting to separate HTTP services is a mechanical refactor — the A2A interface stays the same.
```

- [ ] **Step 2: Commit**

```
docs: add step-by-step demo script
```

---

### Task 5: Integration Smoke Test

**Files:**
- Create: `tests/smoke.test.ts`

- [ ] **Step 1: Create `tests/smoke.test.ts`**

This test boots a relay server in-process and validates that all REST endpoints respond correctly. It does not require real adapters — it tests the relay infrastructure end-to-end.

```typescript
// tests/smoke.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "http";
import path from "path";
import {
  createDatabase,
  createEventBus,
  createRegistry,
  createRouterFromConfig,
  createTaskManager,
  createApp,
  seedWorkflows,
} from "@lattice/relay";

let server: Server;
let baseUrl: string;

describe("Smoke test: relay endpoints", () => {
  beforeAll(async () => {
    const db = createDatabase(":memory:");
    const bus = createEventBus();
    const registry = createRegistry(db, bus);
    const router = createRouterFromConfig(registry, db, { strategy: "simple" });
    const taskManager = createTaskManager(db, bus, registry, router);
    const app = createApp({ db, registry, taskManager, bus });

    // Seed demo workflows
    const workflowDir = path.resolve(__dirname, "..", "workflows");
    seedWorkflows(db, workflowDir);

    await new Promise<void>((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(() => {
    server?.close();
  });

  it("GET /api/agents returns 200 with an array", async () => {
    const res = await fetch(`${baseUrl}/api/agents`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /api/tasks returns 400 without text", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  it("POST /api/tasks returns 201 with valid text", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "smoke test task" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.status).toBe("submitted");
  });

  it("GET /api/tasks returns 200 with an array", async () => {
    const res = await fetch(`${baseUrl}/api/tasks`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(1);
  });

  it("GET /api/tasks/:id returns the created task", async () => {
    // Create a task first
    const createRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "fetch by id" }),
    });
    const created = await createRes.json();

    const res = await fetch(`${baseUrl}/api/tasks/${created.id}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(created.id);
  });

  it("GET /api/tasks/:id returns 404 for unknown id", async () => {
    const res = await fetch(`${baseUrl}/api/tasks/nonexistent-id`);
    expect(res.status).toBe(404);
  });

  it("GET /api/routing/stats returns 200 with an array", async () => {
    const res = await fetch(`${baseUrl}/api/routing/stats`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
  });

  it("GET /api/workflows returns 200 with seeded workflows", async () => {
    const res = await fetch(`${baseUrl}/api/workflows`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);

    const names = body.map((w: { name: string }) => w.name);
    expect(names).toContain("Bug Fix Pipeline");
    expect(names).toContain("Code Review");
  });

  it("POST /api/workflows creates a new workflow", async () => {
    const res = await fetch(`${baseUrl}/api/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Smoke Test Workflow",
        definition: { nodes: [], edges: [] },
      }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.id).toBeDefined();
    expect(body.name).toBe("Smoke Test Workflow");
  });

  it("GET /api/events returns SSE content type", async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 500);

    try {
      const res = await fetch(`${baseUrl}/api/events`, {
        signal: controller.signal,
      });
      expect(res.headers.get("content-type")).toContain("text/event-stream");
    } catch {
      // AbortError is expected — we just want to check headers
    } finally {
      clearTimeout(timeoutId);
    }
  });
});
```

- [ ] **Step 2: Ensure the root Vitest config picks up `tests/smoke.test.ts`**

If there is no root `vitest.config.ts`, the test can be run explicitly:

```bash
npx vitest run tests/smoke.test.ts
```

Alternatively, add a smoke test script to root `package.json`:

```json
{
  "scripts": {
    "test:smoke": "vitest run tests/smoke.test.ts"
  }
}
```

- [ ] **Step 3: Commit**

```
test: add integration smoke test for all relay endpoints
```

---

### Task 6: Final Verification Checklist

This task is manual verification — no new code. Run through this checklist to confirm everything works end-to-end.

- [ ] **Step 1: Run the full test suite**

```bash
npx vitest run
```

Confirm all 159+ tests pass, including the new `seed-workflows.test.ts` and `smoke.test.ts`.

- [ ] **Step 2: Start the relay and verify startup output**

```bash
npm start
```

Verify output shows:
- All three adapters loaded (or graceful error if CLIs not installed)
- Workflow seeding summary
- Server listening on port 3100
- Agent count

- [ ] **Step 3: Verify REST endpoints manually**

```bash
curl http://localhost:3100/api/agents
curl http://localhost:3100/api/tasks
curl http://localhost:3100/api/workflows
curl http://localhost:3100/api/routing/stats
```

- [ ] **Step 4: Verify SSE stream**

```bash
curl -N http://localhost:3100/api/events &
curl -X POST http://localhost:3100/api/tasks -H 'Content-Type: application/json' -d '{"text":"test"}'
```

Confirm the SSE stream emits a `task:created` event.

- [ ] **Step 5: Verify dashboard loads**

```bash
npm run dev:dashboard
```

Open `http://localhost:3200` and confirm:
- Agent Overview shows registered agents
- Task History lists tasks
- Workflows tab shows seeded workflows
- Flow visualization renders
- Routing Stats displays data

- [ ] **Step 6: Verify CLI commands**

```bash
npx lattice agents
npx lattice send "hello"
npx lattice workflow list
npx lattice routing
```

- [ ] **Step 7: Commit (if any fixes were needed)**

```
fix: end-to-end verification fixes
```
