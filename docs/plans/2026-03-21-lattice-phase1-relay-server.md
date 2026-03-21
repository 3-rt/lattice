# Lattice Phase 1: Relay Server + Adapter Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation relay server that all adapters, dashboard, and CLI will connect to — including A2A types, SQLite database, agent registry, task manager, skill-matching router, event bus, and SSE endpoint.

**Architecture:** Single Node.js/Express process exposing both an A2A JSON-RPC endpoint and a REST API. Adapters are in-process TypeScript modules implementing a shared interface. All state changes publish to an in-process event bus, which feeds an SSE endpoint for real-time consumers. SQLite via better-sqlite3 for persistence.

**Tech Stack:** Node.js, Express, TypeScript, better-sqlite3, uuid, tsup, Vitest

**Spec:** `docs/superpowers/specs/2026-03-21-lattice-design.md`

---

## File Structure

```
lattice/
├── packages/
│   ├── adapters/
│   │   └── base/
│   │       ├── src/
│   │       │   ├── types.ts              # All A2A data model interfaces
│   │       │   ├── adapter.interface.ts   # LatticeAdapter interface
│   │       │   └── index.ts              # Re-exports
│   │       ├── package.json
│   │       └── tsconfig.json
│   └── relay/
│       ├── src/
│       │   ├── db.ts                     # SQLite schema + query helpers
│       │   ├── event-bus.ts              # In-process pub/sub EventEmitter
│       │   ├── registry.ts              # Agent Card registry
│       │   ├── router.ts                # Skill-matching task router
│       │   ├── task-manager.ts          # Task lifecycle management
│       │   ├── sse.ts                   # SSE endpoint with ring buffer
│       │   ├── server.ts                # Express app setup + routes
│       │   ├── index.ts                 # Library re-exports
│       │   └── main.ts                  # Startup script (reads config, boots server)
│       ├── tests/
│       │   ├── db.test.ts
│       │   ├── event-bus.test.ts
│       │   ├── registry.test.ts
│       │   ├── router.test.ts
│       │   ├── task-manager.test.ts
│       │   ├── sse.test.ts
│       │   └── server.test.ts
│       ├── package.json
│       └── tsconfig.json
├── package.json                          # Monorepo root with npm workspaces
├── tsconfig.json                         # Root tsconfig
└── lattice.config.json                   # Default config
```

---

### Task 1: Monorepo Scaffold

**Files:**
- Create: `lattice/package.json`
- Create: `lattice/tsconfig.json`
- Create: `lattice/packages/adapters/base/package.json`
- Create: `lattice/packages/adapters/base/tsconfig.json`
- Create: `lattice/packages/relay/package.json`
- Create: `lattice/packages/relay/tsconfig.json`
- Create: `lattice/lattice.config.json`

- [ ] **Step 1: Create project directory and root package.json**

```bash
mkdir -p ~/lattice
```

```json
// lattice/package.json
{
  "name": "lattice",
  "version": "0.1.0",
  "private": true,
  "workspaces": [
    "packages/*",
    "packages/adapters/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces",
    "test": "npm run test --workspaces",
    "dev": "npm run dev --workspace=packages/relay"
  },
  "devDependencies": {
    "typescript": "^5.7.0",
    "vitest": "^3.0.0",
    "tsup": "^8.0.0"
  }
}
```

- [ ] **Step 2: Create root tsconfig.json**

```json
// lattice/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  }
}
```

- [ ] **Step 3: Create base adapter package**

```json
// lattice/packages/adapters/base/package.json
{
  "name": "@lattice/adapter-base",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "test": "vitest run"
  },
  "files": ["dist"]
}
```

```json
// lattice/packages/adapters/base/tsconfig.json
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create relay package**

```json
// lattice/packages/relay/package.json
{
  "name": "@lattice/relay",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "@lattice/adapter-base": "*",
    "better-sqlite3": "^11.0.0",
    "cors": "^2.8.5",
    "express": "^5.0.0",
    "uuid": "^11.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/cors": "^2.8.0",
    "@types/express": "^5.0.0",
    "@types/uuid": "^10.0.0",
    "tsx": "^4.0.0",
    "supertest": "^7.0.0",
    "@types/supertest": "^6.0.0"
  },
  "files": ["dist"]
}
```

```json
// lattice/packages/relay/tsconfig.json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 5: Create default config file**

```json
// lattice/lattice.config.json
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
      "enabled": false,
      "codexPath": "codex"
    }
  },
  "dashboard": {
    "port": 3200
  },
  "routing": {
    "strategy": "learned",
    "fallback": "round-robin"
  }
}
```

- [ ] **Step 6: Install dependencies and verify workspace resolution**

```bash
cd ~/lattice && npm install
```

Expected: clean install, all workspaces linked.

- [ ] **Step 7: Initialize git and commit**

```bash
cd ~/lattice && git init && git add -A && git commit -m "chore: scaffold lattice monorepo with npm workspaces"
```

---

### Task 2: A2A Types + Adapter Interface

**Files:**
- Create: `packages/adapters/base/src/types.ts`
- Create: `packages/adapters/base/src/adapter.interface.ts`
- Create: `packages/adapters/base/src/index.ts`

- [ ] **Step 1: Write types.ts with all A2A data models**

```typescript
// packages/adapters/base/src/types.ts

export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
  };
  skills: Skill[];
  authentication: {
    schemes: string[];
  };
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export type TaskStatus =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled";

export interface Task {
  id: string;
  status: TaskStatus;
  artifacts: Artifact[];
  history: Message[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    assignedAgent: string;
    routingReason: string;
    latencyMs: number;
    cost?: number;
    workflowId?: string;
    workflowStepId?: string;
  };
}

export interface Message {
  role: "user" | "agent";
  parts: Part[];
}

export interface Part {
  type: "text" | "file" | "data";
  text?: string;
  file?: { name: string; mimeType: string; bytes: string };
  data?: Record<string, unknown>;
}

export interface Artifact {
  name: string;
  parts: Part[];
}

export interface TaskStatusUpdate {
  taskId: string;
  status: TaskStatus;
  message?: string;
  artifacts?: Artifact[];
}

export type SSEEventType =
  | { type: "agent:registered"; agent: AgentCard }
  | { type: "agent:deregistered"; agentName: string }
  | { type: "agent:status"; agentName: string; status: string }
  | { type: "task:created"; task: Task }
  | { type: "task:routed"; taskId: string; agentName: string; reason: string }
  | { type: "task:progress"; taskId: string; message: string }
  | { type: "task:completed"; task: Task }
  | { type: "task:failed"; taskId: string; error: string }
  | { type: "task:canceled"; taskId: string }
  | { type: "task:input-required"; taskId: string; message: string }
  | { type: "workflow:started"; runId: string; workflowId: string }
  | { type: "workflow:step"; runId: string; stepId: string; status: string }
  | { type: "workflow:completed"; runId: string }
  | { type: "message:sent"; from: string; to: string; taskId: string; preview: string }
  | { type: "message:received"; from: string; to: string; taskId: string; preview: string };
```

- [ ] **Step 2: Write adapter.interface.ts**

```typescript
// packages/adapters/base/src/adapter.interface.ts

import type { AgentCard, Task, TaskStatusUpdate } from "./types.js";

export interface LatticeAdapter {
  getAgentCard(): AgentCard;
  executeTask(task: Task): Promise<Task>;
  streamTask(task: Task): AsyncGenerator<TaskStatusUpdate>;
  healthCheck(): Promise<boolean>;
}
```

- [ ] **Step 3: Write index.ts re-exports**

```typescript
// packages/adapters/base/src/index.ts

export * from "./types.js";
export * from "./adapter.interface.js";
```

- [ ] **Step 4: Build and verify**

```bash
cd ~/lattice && npx tsup packages/adapters/base/src/index.ts --format esm --dts --outdir packages/adapters/base/dist
```

Expected: builds without errors, produces `dist/index.js` and `dist/index.d.ts`.

- [ ] **Step 5: Commit**

```bash
cd ~/lattice && git add packages/adapters/base && git commit -m "feat: add A2A data model types and adapter interface"
```

---

### Task 3: SQLite Database Layer

**Files:**
- Create: `packages/relay/src/db.ts`
- Create: `packages/relay/tests/db.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/db.test.ts

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type LatticeDB } from "../src/db.js";
import fs from "fs";
import path from "path";

const TEST_DB_PATH = path.join(import.meta.dirname, "test.db");

describe("LatticeDB", () => {
  let db: LatticeDB;

  beforeEach(() => {
    db = createDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("agents", () => {
    it("should insert and retrieve an agent", () => {
      const card = {
        name: "test-agent",
        description: "A test agent",
        url: "http://localhost:3100/a2a/agents/test-agent",
        version: "1.0.0",
        capabilities: { streaming: false, pushNotifications: false },
        skills: [],
        authentication: { schemes: [] },
      };

      db.upsertAgent("test-agent", card);
      const agents = db.listAgents();

      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe("test-agent");
      expect(agents[0].status).toBe("online");
      expect(JSON.parse(agents[0].agent_card)).toEqual(card);
    });

    it("should update agent status", () => {
      const card = {
        name: "test-agent",
        description: "A test agent",
        url: "http://localhost:3100/a2a/agents/test-agent",
        version: "1.0.0",
        capabilities: { streaming: false, pushNotifications: false },
        skills: [],
        authentication: { schemes: [] },
      };

      db.upsertAgent("test-agent", card);
      db.updateAgentStatus("test-agent", "offline");
      const agents = db.listAgents();

      expect(agents[0].status).toBe("offline");
    });

    it("should delete an agent", () => {
      const card = {
        name: "test-agent",
        description: "A test agent",
        url: "http://localhost:3100/a2a/agents/test-agent",
        version: "1.0.0",
        capabilities: { streaming: false, pushNotifications: false },
        skills: [],
        authentication: { schemes: [] },
      };

      db.upsertAgent("test-agent", card);
      db.deleteAgent("test-agent");
      const agents = db.listAgents();

      expect(agents).toHaveLength(0);
    });
  });

  describe("tasks", () => {
    it("should insert and retrieve a task", () => {
      const taskId = "task-123";
      const history = [{ role: "user" as const, parts: [{ type: "text" as const, text: "fix the bug" }] }];

      db.insertTask(taskId, history);
      const task = db.getTask(taskId);

      expect(task).toBeDefined();
      expect(task!.id).toBe(taskId);
      expect(task!.status).toBe("submitted");
      expect(JSON.parse(task!.history)).toEqual(history);
    });

    it("should update task status and assigned agent", () => {
      const taskId = "task-123";
      const history = [{ role: "user" as const, parts: [{ type: "text" as const, text: "fix the bug" }] }];

      db.insertTask(taskId, history);
      db.updateTask(taskId, {
        status: "working",
        assigned_agent: "claude-code",
        routing_reason: "skill match: coding",
      });
      const task = db.getTask(taskId);

      expect(task!.status).toBe("working");
      expect(task!.assigned_agent).toBe("claude-code");
      expect(task!.routing_reason).toBe("skill match: coding");
    });

    it("should update task result on completion", () => {
      const taskId = "task-123";
      const history = [{ role: "user" as const, parts: [{ type: "text" as const, text: "fix" }] }];
      const result = [{ name: "output", parts: [{ type: "text", text: "fixed!" }] }];

      db.insertTask(taskId, history);
      db.updateTask(taskId, {
        status: "completed",
        result: JSON.stringify(result),
        latency_ms: 1200,
      });
      const task = db.getTask(taskId);

      expect(task!.status).toBe("completed");
      expect(JSON.parse(task!.result!)).toEqual(result);
      expect(task!.latency_ms).toBe(1200);
    });

    it("should list tasks with optional status filter", () => {
      const history = [{ role: "user" as const, parts: [{ type: "text" as const, text: "test" }] }];

      db.insertTask("t1", history);
      db.insertTask("t2", history);
      db.updateTask("t1", { status: "completed" });

      expect(db.listTasks()).toHaveLength(2);
      expect(db.listTasks({ status: "completed" })).toHaveLength(1);
      expect(db.listTasks({ status: "submitted" })).toHaveLength(1);
    });
  });

  describe("routing_stats", () => {
    it("should upsert routing stats", () => {
      db.updateRoutingStats("claude-code", "coding", true, 500, 0.01);
      db.updateRoutingStats("claude-code", "coding", true, 300, 0.02);
      db.updateRoutingStats("claude-code", "coding", false, 1000, 0);

      const stats = db.getRoutingStats();
      expect(stats).toHaveLength(1);
      expect(stats[0].agent_name).toBe("claude-code");
      expect(stats[0].successes).toBe(2);
      expect(stats[0].failures).toBe(1);
      expect(stats[0].total_latency_ms).toBe(1800);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/db.test.ts
```

Expected: FAIL — module `../src/db.js` does not exist.

- [ ] **Step 3: Write db.ts implementation**

```typescript
// packages/relay/src/db.ts

import Database from "better-sqlite3";
import type { AgentCard, Message } from "@lattice/adapter-base";

export interface AgentRow {
  name: string;
  agent_card: string;
  status: string;
  registered_at: string;
  last_heartbeat: string | null;
}

export interface TaskRow {
  id: string;
  status: string;
  assigned_agent: string | null;
  history: string;
  result: string | null;
  routing_reason: string | null;
  latency_ms: number | null;
  cost: number | null;
  workflow_id: string | null;
  workflow_step_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoutingStatsRow {
  agent_name: string;
  task_category: string;
  successes: number;
  failures: number;
  total_latency_ms: number;
  total_cost: number;
  updated_at: string;
}

export interface TaskFilter {
  status?: string;
  assigned_agent?: string;
}

export interface TaskUpdate {
  status?: string;
  assigned_agent?: string;
  result?: string;
  routing_reason?: string;
  latency_ms?: number;
  cost?: number;
  workflow_id?: string;
  workflow_step_id?: string;
}

export interface LatticeDB {
  upsertAgent(name: string, card: AgentCard): void;
  updateAgentStatus(name: string, status: string): void;
  updateAgentHeartbeat(name: string): void;
  deleteAgent(name: string): void;
  listAgents(): AgentRow[];
  getAgent(name: string): AgentRow | undefined;

  insertTask(id: string, history: Message[]): void;
  getTask(id: string): TaskRow | undefined;
  updateTask(id: string, update: TaskUpdate): void;
  listTasks(filter?: TaskFilter): TaskRow[];

  updateTaskHistory(id: string, history: Message[]): void;

  updateRoutingStats(
    agentName: string,
    taskCategory: string,
    success: boolean,
    latencyMs: number,
    cost: number
  ): void;
  getRoutingStats(): RoutingStatsRow[];

  close(): void;
}

export function createDatabase(dbPath: string): LatticeDB {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      name TEXT PRIMARY KEY,
      agent_card JSON NOT NULL,
      status TEXT DEFAULT 'online',
      registered_at TEXT DEFAULT (datetime('now')),
      last_heartbeat TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      assigned_agent TEXT,
      history JSON NOT NULL,
      result JSON,
      routing_reason TEXT,
      latency_ms INTEGER,
      cost REAL,
      workflow_id TEXT,
      workflow_step_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (assigned_agent) REFERENCES agents(name)
    );

    CREATE TABLE IF NOT EXISTS routing_stats (
      agent_name TEXT NOT NULL,
      task_category TEXT NOT NULL,
      successes INTEGER DEFAULT 0,
      failures INTEGER DEFAULT 0,
      total_latency_ms INTEGER DEFAULT 0,
      total_cost REAL DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (agent_name, task_category)
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      definition JSON NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL,
      status TEXT DEFAULT 'running',
      current_step TEXT,
      context JSON DEFAULT '{}',
      started_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (workflow_id) REFERENCES workflows(id)
    );
  `);

  const stmts = {
    upsertAgent: db.prepare(`
      INSERT INTO agents (name, agent_card, status) VALUES (?, ?, 'online')
      ON CONFLICT(name) DO UPDATE SET agent_card = excluded.agent_card, status = 'online', last_heartbeat = datetime('now')
    `),
    updateAgentStatus: db.prepare(`UPDATE agents SET status = ?, last_heartbeat = datetime('now') WHERE name = ?`),
    updateAgentHeartbeat: db.prepare(`UPDATE agents SET last_heartbeat = datetime('now') WHERE name = ?`),
    deleteAgent: db.prepare(`DELETE FROM agents WHERE name = ?`),
    listAgents: db.prepare(`SELECT * FROM agents`),
    getAgent: db.prepare(`SELECT * FROM agents WHERE name = ?`),

    insertTask: db.prepare(`INSERT INTO tasks (id, status, history) VALUES (?, 'submitted', ?)`),
    getTask: db.prepare(`SELECT * FROM tasks WHERE id = ?`),
    updateTask: db.prepare(`
      UPDATE tasks SET
        status = COALESCE(?, status),
        assigned_agent = COALESCE(?, assigned_agent),
        result = COALESCE(?, result),
        routing_reason = COALESCE(?, routing_reason),
        latency_ms = COALESCE(?, latency_ms),
        cost = COALESCE(?, cost),
        workflow_id = COALESCE(?, workflow_id),
        workflow_step_id = COALESCE(?, workflow_step_id),
        updated_at = datetime('now')
      WHERE id = ?
    `),
    listTasks: db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC`),
    listTasksByStatus: db.prepare(`SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC`),
    listTasksByAgent: db.prepare(`SELECT * FROM tasks WHERE assigned_agent = ? ORDER BY created_at DESC`),

    updateTaskHistory: db.prepare(`UPDATE tasks SET history = ?, updated_at = datetime('now') WHERE id = ?`),

    upsertRoutingStats: db.prepare(`
      INSERT INTO routing_stats (agent_name, task_category, successes, failures, total_latency_ms, total_cost)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_name, task_category) DO UPDATE SET
        successes = routing_stats.successes + excluded.successes,
        failures = routing_stats.failures + excluded.failures,
        total_latency_ms = routing_stats.total_latency_ms + excluded.total_latency_ms,
        total_cost = routing_stats.total_cost + excluded.total_cost,
        updated_at = datetime('now')
    `),
    getRoutingStats: db.prepare(`SELECT * FROM routing_stats`),
  };

  return {
    upsertAgent(name, card) {
      stmts.upsertAgent.run(name, JSON.stringify(card));
    },
    updateAgentStatus(name, status) {
      stmts.updateAgentStatus.run(status, name);
    },
    updateAgentHeartbeat(name) {
      stmts.updateAgentHeartbeat.run(name);
    },
    deleteAgent(name) {
      stmts.deleteAgent.run(name);
    },
    listAgents() {
      return stmts.listAgents.all() as AgentRow[];
    },
    getAgent(name) {
      return stmts.getAgent.get(name) as AgentRow | undefined;
    },

    insertTask(id, history) {
      stmts.insertTask.run(id, JSON.stringify(history));
    },
    getTask(id) {
      return stmts.getTask.get(id) as TaskRow | undefined;
    },
    updateTask(id, update) {
      stmts.updateTask.run(
        update.status ?? null,
        update.assigned_agent ?? null,
        update.result ?? null,
        update.routing_reason ?? null,
        update.latency_ms ?? null,
        update.cost ?? null,
        update.workflow_id ?? null,
        update.workflow_step_id ?? null,
        id
      );
    },
    listTasks(filter) {
      if (filter?.status) return stmts.listTasksByStatus.all(filter.status) as TaskRow[];
      if (filter?.assigned_agent) return stmts.listTasksByAgent.all(filter.assigned_agent) as TaskRow[];
      return stmts.listTasks.all() as TaskRow[];
    },

    updateTaskHistory(id, history) {
      stmts.updateTaskHistory.run(JSON.stringify(history), id);
    },

    updateRoutingStats(agentName, taskCategory, success, latencyMs, cost) {
      stmts.upsertRoutingStats.run(
        agentName,
        taskCategory,
        success ? 1 : 0,
        success ? 0 : 1,
        latencyMs,
        cost
      );
    },
    getRoutingStats() {
      return stmts.getRoutingStats.all() as RoutingStatsRow[];
    },

    close() {
      db.close();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/db.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/lattice && git add packages/relay/src/db.ts packages/relay/tests/db.test.ts && git commit -m "feat: add SQLite database layer with agent, task, and routing_stats tables"
```

---

### Task 4: Event Bus

**Files:**
- Create: `packages/relay/src/event-bus.ts`
- Create: `packages/relay/tests/event-bus.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/event-bus.test.ts

import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "../src/event-bus.js";

describe("EventBus", () => {
  it("should emit and receive events", () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.on("task:created", handler);
    bus.emit({ type: "task:created", task: { id: "t1" } as any });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "task:created", task: { id: "t1" } });
  });

  it("should support wildcard listeners", () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.onAny(handler);
    bus.emit({ type: "task:created", task: { id: "t1" } as any });
    bus.emit({ type: "agent:registered", agent: {} as any });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("should maintain a ring buffer of recent events", () => {
    const bus = createEventBus(3); // buffer size 3
    bus.emit({ type: "agent:status", agentName: "a", status: "online" });
    bus.emit({ type: "agent:status", agentName: "b", status: "online" });
    bus.emit({ type: "agent:status", agentName: "c", status: "online" });
    bus.emit({ type: "agent:status", agentName: "d", status: "online" });

    const buffered = bus.getBufferedEvents();
    expect(buffered).toHaveLength(3);
    expect(buffered[0].event.agentName).toBe("b"); // oldest dropped
  });

  it("should assign incrementing IDs to events", () => {
    const bus = createEventBus();
    bus.emit({ type: "agent:status", agentName: "a", status: "online" });
    bus.emit({ type: "agent:status", agentName: "b", status: "online" });

    const buffered = bus.getBufferedEvents();
    expect(buffered[0].id).toBe(1);
    expect(buffered[1].id).toBe(2);
  });

  it("should return events after a given ID", () => {
    const bus = createEventBus();
    bus.emit({ type: "agent:status", agentName: "a", status: "online" });
    bus.emit({ type: "agent:status", agentName: "b", status: "online" });
    bus.emit({ type: "agent:status", agentName: "c", status: "online" });

    const after = bus.getBufferedEventsAfter(1);
    expect(after).toHaveLength(2);
    expect(after[0].id).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/event-bus.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write event-bus.ts implementation**

```typescript
// packages/relay/src/event-bus.ts

import { EventEmitter } from "events";
import type { SSEEventType } from "@lattice/adapter-base";

export interface BufferedEvent {
  id: number;
  event: SSEEventType;
  timestamp: string;
}

export interface LatticeEventBus {
  emit(event: SSEEventType): void;
  on(type: SSEEventType["type"], handler: (event: SSEEventType) => void): void;
  onAny(handler: (event: SSEEventType) => void): void;
  off(type: SSEEventType["type"], handler: (event: SSEEventType) => void): void;
  offAny(handler: (event: SSEEventType) => void): void;
  getBufferedEvents(): BufferedEvent[];
  getBufferedEventsAfter(lastId: number): BufferedEvent[];
}

export function createEventBus(bufferSize: number = 50): LatticeEventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);
  const buffer: BufferedEvent[] = [];
  let nextId = 1;

  return {
    emit(event) {
      const buffered: BufferedEvent = {
        id: nextId++,
        event,
        timestamp: new Date().toISOString(),
      };
      buffer.push(buffered);
      if (buffer.length > bufferSize) {
        buffer.shift();
      }
      emitter.emit(event.type, event);
      emitter.emit("*", event);
    },

    on(type, handler) {
      emitter.on(type, handler);
    },

    onAny(handler) {
      emitter.on("*", handler);
    },

    off(type, handler) {
      emitter.off(type, handler);
    },

    offAny(handler) {
      emitter.off("*", handler);
    },

    getBufferedEvents() {
      return [...buffer];
    },

    getBufferedEventsAfter(lastId) {
      return buffer.filter((e) => e.id > lastId);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/event-bus.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/lattice && git add packages/relay/src/event-bus.ts packages/relay/tests/event-bus.test.ts && git commit -m "feat: add event bus with ring buffer and incrementing IDs"
```

---

### Task 5: Agent Registry

**Files:**
- Create: `packages/relay/src/registry.ts`
- Create: `packages/relay/tests/registry.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/registry.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRegistry } from "../src/registry.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import type { LatticeAdapter, AgentCard } from "@lattice/adapter-base";

function createMockAdapter(name: string): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name} adapter`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "coding", name: "Coding", description: "Write code", tags: ["code", "debug"] }],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn(),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("Registry", () => {
  let registry: ReturnType<typeof createRegistry>;
  let db: ReturnType<typeof createDatabase>;
  let bus: ReturnType<typeof createEventBus>;

  beforeEach(() => {
    db = createDatabase(":memory:");
    bus = createEventBus();
    registry = createRegistry(db, bus);
  });

  it("should register an adapter and emit event", () => {
    const handler = vi.fn();
    bus.on("agent:registered", handler);

    const adapter = createMockAdapter("claude-code");
    registry.register(adapter);

    expect(registry.listAgents()).toHaveLength(1);
    expect(registry.listAgents()[0].name).toBe("claude-code");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("should deregister an adapter and emit event", () => {
    const handler = vi.fn();
    bus.on("agent:deregistered", handler);

    const adapter = createMockAdapter("claude-code");
    registry.register(adapter);
    registry.deregister("claude-code");

    expect(registry.listAgents()).toHaveLength(0);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("should get adapter by name", () => {
    const adapter = createMockAdapter("claude-code");
    registry.register(adapter);

    expect(registry.getAdapter("claude-code")).toBe(adapter);
    expect(registry.getAdapter("nonexistent")).toBeUndefined();
  });

  it("should persist agents to database", () => {
    const adapter = createMockAdapter("claude-code");
    registry.register(adapter);

    const rows = db.listAgents();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("claude-code");
  });

  it("should run health checks and emit status changes", async () => {
    const handler = vi.fn();
    bus.on("agent:status", handler);

    const adapter = createMockAdapter("claude-code");
    (adapter.healthCheck as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    registry.register(adapter);

    await registry.runHealthChecks();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agent:status", agentName: "claude-code", status: "offline" })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write registry.ts implementation**

```typescript
// packages/relay/src/registry.ts

import type { LatticeAdapter, AgentCard } from "@lattice/adapter-base";
import type { LatticeDB } from "./db.js";
import type { LatticeEventBus } from "./event-bus.js";

export interface AgentEntry {
  name: string;
  card: AgentCard;
  adapter: LatticeAdapter;
  status: "online" | "offline";
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

export function createRegistry(db: LatticeDB, eventBus: LatticeEventBus): LatticeRegistry {
  const agents = new Map<string, AgentEntry>();

  return {
    register(adapter) {
      const card = adapter.getAgentCard();
      const entry: AgentEntry = {
        name: card.name,
        card,
        adapter,
        status: "online",
      };
      agents.set(card.name, entry);
      db.upsertAgent(card.name, card);
      eventBus.emit({ type: "agent:registered", agent: card });
    },

    deregister(name) {
      agents.delete(name);
      db.deleteAgent(name);
      eventBus.emit({ type: "agent:deregistered", agentName: name });
    },

    getAdapter(name) {
      return agents.get(name)?.adapter;
    },

    getAgentCard(name) {
      return agents.get(name)?.card;
    },

    listAgents() {
      return [...agents.values()];
    },

    getOnlineAgents() {
      return [...agents.values()].filter((a) => a.status === "online");
    },

    async runHealthChecks() {
      for (const [name, entry] of agents) {
        try {
          const healthy = await entry.adapter.healthCheck();
          const newStatus = healthy ? "online" : "offline";
          if (newStatus !== entry.status) {
            entry.status = newStatus;
            db.updateAgentStatus(name, newStatus);
            eventBus.emit({ type: "agent:status", agentName: name, status: newStatus });
          }
        } catch {
          if (entry.status !== "offline") {
            entry.status = "offline";
            db.updateAgentStatus(name, "offline");
            eventBus.emit({ type: "agent:status", agentName: name, status: "offline" });
          }
        }
      }
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/registry.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/lattice && git add packages/relay/src/registry.ts packages/relay/tests/registry.test.ts && git commit -m "feat: add agent registry with health checks and event emission"
```

---

### Task 6: Skill-Matching Router

**Files:**
- Create: `packages/relay/src/router.ts`
- Create: `packages/relay/tests/router.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/router.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRouter } from "../src/router.js";
import { createRegistry } from "../src/registry.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import type { LatticeAdapter, AgentCard } from "@lattice/adapter-base";

function createMockAdapter(name: string, skillTags: string[]): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "skill-1", name: "Skill", description: "A skill", tags: skillTags }],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn(),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("Router", () => {
  let registry: ReturnType<typeof createRegistry>;
  let router: ReturnType<typeof createRouter>;

  beforeEach(() => {
    const db = createDatabase(":memory:");
    const bus = createEventBus();
    registry = createRegistry(db, bus);
    router = createRouter(registry);
  });

  it("should route to agent with best skill tag match", () => {
    registry.register(createMockAdapter("claude-code", ["code", "debug", "refactor"]));
    registry.register(createMockAdapter("openclaw", ["messaging", "telegram", "notify"]));

    const result = router.route("fix the bug and debug the code");
    expect(result.agentName).toBe("claude-code");
    expect(result.reason).toContain("skill match");
  });

  it("should route messaging tasks to openclaw", () => {
    registry.register(createMockAdapter("claude-code", ["code", "debug"]));
    registry.register(createMockAdapter("openclaw", ["messaging", "telegram", "notify"]));

    const result = router.route("send a telegram notify message");
    expect(result.agentName).toBe("openclaw");
  });

  it("should fall back to round-robin when no skills match", () => {
    registry.register(createMockAdapter("agent-a", ["cooking"]));
    registry.register(createMockAdapter("agent-b", ["gardening"]));

    const result = router.route("do something completely unrelated");
    expect(["agent-a", "agent-b"]).toContain(result.agentName);
    expect(result.reason).toContain("round-robin");
  });

  it("should respect explicit agent override", () => {
    registry.register(createMockAdapter("claude-code", ["code"]));
    registry.register(createMockAdapter("openclaw", ["messaging"]));

    const result = router.route("fix the code", "openclaw");
    expect(result.agentName).toBe("openclaw");
    expect(result.reason).toContain("explicit");
  });

  it("should throw if explicit agent is not registered", () => {
    registry.register(createMockAdapter("claude-code", ["code"]));

    expect(() => router.route("fix", "nonexistent")).toThrow("not found");
  });

  it("should break ties by registration order", () => {
    registry.register(createMockAdapter("first", ["code"]));
    registry.register(createMockAdapter("second", ["code"]));

    const result = router.route("write some code");
    expect(result.agentName).toBe("first");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/router.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write router.ts implementation**

```typescript
// packages/relay/src/router.ts

import type { LatticeRegistry } from "./registry.js";

export interface RouteResult {
  agentName: string;
  reason: string;
}

export interface LatticeRouter {
  route(taskText: string, explicitAgent?: string): RouteResult;
}

export function createRouter(registry: LatticeRegistry): LatticeRouter {
  let roundRobinIndex = 0;
  return {
    route(taskText, explicitAgent) {
      const onlineAgents = registry.getOnlineAgents();

      if (onlineAgents.length === 0) {
        throw new Error("No agents available");
      }

      if (explicitAgent) {
        const agent = onlineAgents.find((a) => a.name === explicitAgent);
        if (!agent) {
          throw new Error(`Agent "${explicitAgent}" not found or offline`);
        }
        return { agentName: explicitAgent, reason: "explicit agent override" };
      }

      const words = taskText.toLowerCase().split(/\s+/);

      let bestAgent = "";
      let bestScore = 0;

      for (const agent of onlineAgents) {
        let score = 0;
        for (const skill of agent.card.skills) {
          for (const tag of skill.tags) {
            const tagLower = tag.toLowerCase();
            for (const word of words) {
              if (word.includes(tagLower) || tagLower.includes(word)) {
                score++;
              }
            }
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestAgent = agent.name;
        }
      }

      if (bestScore > 0) {
        return {
          agentName: bestAgent,
          reason: `skill match (score: ${bestScore})`,
        };
      }

      // Round-robin fallback
      const index = roundRobinIndex % onlineAgents.length;
      roundRobinIndex++;
      return {
        agentName: onlineAgents[index].name,
        reason: "round-robin fallback (no skill match)",
      };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/router.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/lattice && git add packages/relay/src/router.ts packages/relay/tests/router.test.ts && git commit -m "feat: add skill-matching router with round-robin fallback"
```

---

### Task 7: Task Manager

**Files:**
- Create: `packages/relay/src/task-manager.ts`
- Create: `packages/relay/tests/task-manager.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/task-manager.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTaskManager } from "../src/task-manager.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import { createRegistry } from "../src/registry.js";
import { createRouter } from "../src/router.js";
import type { LatticeAdapter, AgentCard, Task } from "@lattice/adapter-base";

function createMockAdapter(name: string, skillTags: string[]): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "skill-1", name: "Skill", description: "A skill", tags: skillTags }],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn().mockImplementation(async (task: Task): Promise<Task> => ({
      ...task,
      status: "completed",
      artifacts: [{ name: "result", parts: [{ type: "text", text: "done" }] }],
    })),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("TaskManager", () => {
  let taskManager: ReturnType<typeof createTaskManager>;
  let bus: ReturnType<typeof createEventBus>;
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    const db = createDatabase(":memory:");
    bus = createEventBus();
    registry = createRegistry(db, bus);
    const router = createRouter(registry);
    taskManager = createTaskManager(db, bus, registry, router);
  });

  it("should create a task and emit task:created", async () => {
    const handler = vi.fn();
    bus.on("task:created", handler);

    registry.register(createMockAdapter("claude-code", ["code"]));
    const task = await taskManager.createTask("fix the code bug");

    expect(task.id).toBeDefined();
    expect(task.status).toBe("submitted");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("should execute a task through the full lifecycle", async () => {
    const routedHandler = vi.fn();
    const completedHandler = vi.fn();
    bus.on("task:routed", routedHandler);
    bus.on("task:completed", completedHandler);

    registry.register(createMockAdapter("claude-code", ["code"]));
    const task = await taskManager.createTask("fix the code bug");
    const result = await taskManager.executeTask(task.id);

    expect(result.status).toBe("completed");
    expect(result.artifacts).toHaveLength(1);
    expect(routedHandler).toHaveBeenCalledOnce();
    expect(completedHandler).toHaveBeenCalledOnce();
  });

  it("should handle adapter failure gracefully", async () => {
    const failHandler = vi.fn();
    bus.on("task:failed", failHandler);

    const adapter = createMockAdapter("bad-agent", ["code"]);
    (adapter.executeTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
    registry.register(adapter);

    const task = await taskManager.createTask("fix code");
    const result = await taskManager.executeTask(task.id);

    expect(result.status).toBe("failed");
    expect(failHandler).toHaveBeenCalledOnce();
  });

  it("should route to explicit agent when specified", async () => {
    registry.register(createMockAdapter("claude-code", ["code"]));
    registry.register(createMockAdapter("openclaw", ["messaging"]));

    const task = await taskManager.createTask("fix code", "openclaw");
    const result = await taskManager.executeTask(task.id);

    expect(result.metadata.assignedAgent).toBe("openclaw");
  });

  it("should get task by id", async () => {
    registry.register(createMockAdapter("claude-code", ["code"]));
    const task = await taskManager.createTask("fix code");
    const retrieved = taskManager.getTask(task.id);

    expect(retrieved).toBeDefined();
    expect(retrieved!.id).toBe(task.id);
  });

  it("should list tasks", async () => {
    registry.register(createMockAdapter("claude-code", ["code"]));
    await taskManager.createTask("task 1");
    await taskManager.createTask("task 2");

    const tasks = taskManager.listTasks();
    expect(tasks).toHaveLength(2);
  });

  it("should cancel a task", async () => {
    const cancelHandler = vi.fn();
    bus.on("task:canceled", cancelHandler);

    registry.register(createMockAdapter("claude-code", ["code"]));
    const task = await taskManager.createTask("fix code");
    taskManager.cancelTask(task.id);

    const updated = taskManager.getTask(task.id);
    expect(updated!.status).toBe("canceled");
    expect(cancelHandler).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/task-manager.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write task-manager.ts implementation**

```typescript
// packages/relay/src/task-manager.ts

import { v4 as uuidv4 } from "uuid";
import type { Task, Message } from "@lattice/adapter-base";
import type { LatticeDB } from "./db.js";
import type { LatticeEventBus } from "./event-bus.js";
import type { LatticeRegistry } from "./registry.js";
import type { LatticeRouter } from "./router.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export interface LatticeTaskManager {
  createTask(text: string, explicitAgent?: string): Promise<Task>;
  executeTask(taskId: string): Promise<Task>;
  getTask(taskId: string): Task | undefined;
  listTasks(filter?: { status?: string }): Task[];
  cancelTask(taskId: string): void;
  provideInput(taskId: string, text: string): void;
}

function rowToTask(row: any): Task {
  return {
    id: row.id,
    status: row.status,
    artifacts: row.result ? JSON.parse(row.result) : [],
    history: JSON.parse(row.history),
    metadata: {
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      assignedAgent: row.assigned_agent ?? "",
      routingReason: row.routing_reason ?? "",
      latencyMs: row.latency_ms ?? 0,
      cost: row.cost ?? undefined,
      workflowId: row.workflow_id ?? undefined,
      workflowStepId: row.workflow_step_id ?? undefined,
    },
  };
}

export function createTaskManager(
  db: LatticeDB,
  eventBus: LatticeEventBus,
  registry: LatticeRegistry,
  router: LatticeRouter
): LatticeTaskManager {
  return {
    async createTask(text, explicitAgent) {
      const id = uuidv4();
      const history: Message[] = [
        { role: "user", parts: [{ type: "text", text }] },
      ];

      db.insertTask(id, history);

      const task = rowToTask(db.getTask(id)!);

      // Pre-route if possible (store the explicit agent preference)
      if (explicitAgent) {
        db.updateTask(id, { assigned_agent: explicitAgent, routing_reason: "explicit agent override" });
      }

      eventBus.emit({ type: "task:created", task });
      return task;
    },

    async executeTask(taskId) {
      const row = db.getTask(taskId);
      if (!row) throw new Error(`Task "${taskId}" not found`);

      let task = rowToTask(row);
      const taskText = task.history[0]?.parts[0]?.text ?? "";

      // Route the task
      const routeResult = task.metadata.assignedAgent
        ? { agentName: task.metadata.assignedAgent, reason: task.metadata.routingReason }
        : router.route(taskText);

      const adapter = registry.getAdapter(routeResult.agentName);
      if (!adapter) throw new Error(`Adapter "${routeResult.agentName}" not found`);

      db.updateTask(taskId, {
        status: "working",
        assigned_agent: routeResult.agentName,
        routing_reason: routeResult.reason,
      });

      eventBus.emit({
        type: "task:routed",
        taskId,
        agentName: routeResult.agentName,
        reason: routeResult.reason,
      });

      task = rowToTask(db.getTask(taskId)!);

      const startTime = Date.now();

      try {
        const result = await Promise.race([
          adapter.executeTask(task),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Task execution timed out")), DEFAULT_TIMEOUT_MS)
          ),
        ]);

        const latencyMs = Date.now() - startTime;

        db.updateTask(taskId, {
          status: "completed",
          result: JSON.stringify(result.artifacts),
          latency_ms: latencyMs,
        });

        const completedTask = rowToTask(db.getTask(taskId)!);
        eventBus.emit({ type: "task:completed", task: completedTask });
        return completedTask;
      } catch (err) {
        const latencyMs = Date.now() - startTime;
        const errorMessage = err instanceof Error ? err.message : String(err);

        db.updateTask(taskId, {
          status: "failed",
          result: JSON.stringify({ error: errorMessage }),
          latency_ms: latencyMs,
        });

        const failedTask = rowToTask(db.getTask(taskId)!);
        eventBus.emit({ type: "task:failed", taskId, error: errorMessage });
        return failedTask;
      }
    },

    getTask(taskId) {
      const row = db.getTask(taskId);
      return row ? rowToTask(row) : undefined;
    },

    listTasks(filter) {
      const rows = db.listTasks(filter);
      return rows.map(rowToTask);
    },

    cancelTask(taskId) {
      db.updateTask(taskId, { status: "canceled" });
      eventBus.emit({ type: "task:canceled", taskId });
    },

    provideInput(taskId, text) {
      const row = db.getTask(taskId);
      if (!row) throw new Error(`Task "${taskId}" not found`);

      const history: Message[] = JSON.parse(row.history);
      history.push({ role: "user", parts: [{ type: "text", text }] });

      db.updateTaskHistory(taskId, history);
      db.updateTask(taskId, { status: "working" });
      eventBus.emit({ type: "task:progress", taskId, message: "Additional input provided" });
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/task-manager.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/lattice && git add packages/relay/src/task-manager.ts packages/relay/tests/task-manager.test.ts && git commit -m "feat: add task manager with full lifecycle, routing, timeout, and error handling"
```

---

### Task 8: SSE Endpoint

**Files:**
- Create: `packages/relay/src/sse.ts`
- Create: `packages/relay/tests/sse.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/sse.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import { createSSEHandler } from "../src/sse.js";
import { createEventBus } from "../src/event-bus.js";
import http from "http";

describe("SSE Handler", () => {
  let app: express.Express;
  let server: http.Server;
  let bus: ReturnType<typeof createEventBus>;
  let baseUrl: string;

  beforeEach(async () => {
    bus = createEventBus();
    app = express();
    const sseHandler = createSSEHandler(bus);
    app.get("/api/events", sseHandler);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(() => {
    server.close();
  });

  it("should set correct SSE headers", async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("connection")).toBe("keep-alive");
    res.body?.cancel();
  });

  it("should stream events as SSE formatted data", async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Wait a tick for connection to establish, then emit
    await new Promise((r) => setTimeout(r, 50));
    bus.emit({ type: "agent:status", agentName: "test", status: "online" });

    // Read chunks until we get our event
    let data = "";
    const timeout = setTimeout(() => reader.cancel(), 2000);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        data += decoder.decode(value);
        if (data.includes("agent:status")) break;
      }
    } finally {
      clearTimeout(timeout);
      reader.cancel();
    }

    expect(data).toContain("event: agent:status");
    expect(data).toContain('"agentName":"test"');
  });

  it("should replay buffered events on connect", async () => {
    // Emit events before connecting
    bus.emit({ type: "agent:status", agentName: "pre-1", status: "online" });
    bus.emit({ type: "agent:status", agentName: "pre-2", status: "online" });

    const res = await fetch(`${baseUrl}/api/events`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    let data = "";
    const timeout = setTimeout(() => reader.cancel(), 2000);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        data += decoder.decode(value);
        if (data.includes("pre-2")) break;
      }
    } finally {
      clearTimeout(timeout);
      reader.cancel();
    }

    expect(data).toContain("pre-1");
    expect(data).toContain("pre-2");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/sse.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write sse.ts implementation**

```typescript
// packages/relay/src/sse.ts

import type { Request, Response } from "express";
import type { LatticeEventBus } from "./event-bus.js";
import type { SSEEventType } from "@lattice/adapter-base";

export function createSSEHandler(eventBus: LatticeEventBus) {
  return (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Replay buffered events
    const lastEventId = req.headers["last-event-id"];
    const buffered = lastEventId
      ? eventBus.getBufferedEventsAfter(parseInt(lastEventId as string, 10))
      : eventBus.getBufferedEvents();

    for (const entry of buffered) {
      writeSSE(res, entry.id, entry.event);
    }

    // Listen for new events
    const handler = (event: SSEEventType) => {
      const latest = eventBus.getBufferedEvents();
      const entry = latest[latest.length - 1];
      if (entry) {
        writeSSE(res, entry.id, entry.event);
      }
    };

    eventBus.onAny(handler);

    req.on("close", () => {
      eventBus.offAny(handler);
    });
  };
}

function writeSSE(res: Response, id: number, event: SSEEventType) {
  res.write(`id: ${id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/sse.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd ~/lattice && git add packages/relay/src/sse.ts packages/relay/tests/sse.test.ts && git commit -m "feat: add SSE endpoint with event replay and Last-Event-ID support"
```

---

### Task 9: Express Server + REST API Routes

**Files:**
- Create: `packages/relay/src/server.ts`
- Create: `packages/relay/src/index.ts`
- Create: `packages/relay/tests/server.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/server.test.ts

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { createApp } from "../src/server.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import { createRegistry } from "../src/registry.js";
import { createRouter } from "../src/router.js";
import { createTaskManager } from "../src/task-manager.js";
import type { LatticeAdapter, AgentCard, Task } from "@lattice/adapter-base";

function createMockAdapter(name: string, skillTags: string[]): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "s1", name: "Skill", description: "A skill", tags: skillTags }],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn().mockImplementation(async (task: Task): Promise<Task> => ({
      ...task,
      status: "completed",
      artifacts: [{ name: "result", parts: [{ type: "text", text: "done" }] }],
    })),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("Server API", () => {
  let app: ReturnType<typeof createApp>;
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    const db = createDatabase(":memory:");
    const bus = createEventBus();
    registry = createRegistry(db, bus);
    const router = createRouter(registry);
    const taskManager = createTaskManager(db, bus, registry, router);
    app = createApp({ db, registry, taskManager, bus });
  });

  describe("GET /api/agents", () => {
    it("should return empty array when no agents", async () => {
      const res = await request(app).get("/api/agents");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("should return registered agents", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      const res = await request(app).get("/api/agents");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe("claude-code");
    });
  });

  describe("POST /api/tasks", () => {
    it("should create a task", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      const res = await request(app)
        .post("/api/tasks")
        .send({ text: "fix the bug" });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      expect(res.body.status).toBe("submitted");
    });

    it("should create and execute a task", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      const res = await request(app)
        .post("/api/tasks")
        .send({ text: "fix the code", execute: true });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe("completed");
    });

    it("should route to explicit agent", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      registry.register(createMockAdapter("openclaw", ["messaging"]));
      const res = await request(app)
        .post("/api/tasks")
        .send({ text: "fix code", agent: "openclaw", execute: true });

      expect(res.status).toBe(201);
      expect(res.body.metadata.assignedAgent).toBe("openclaw");
    });
  });

  describe("GET /api/tasks", () => {
    it("should list tasks", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      await request(app).post("/api/tasks").send({ text: "task 1" });
      await request(app).post("/api/tasks").send({ text: "task 2" });

      const res = await request(app).get("/api/tasks");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
    });
  });

  describe("GET /api/tasks/:id", () => {
    it("should return a task by id", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      const created = await request(app).post("/api/tasks").send({ text: "test" });
      const res = await request(app).get(`/api/tasks/${created.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.body.id);
    });

    it("should return 404 for unknown task", async () => {
      const res = await request(app).get("/api/tasks/nonexistent");
      expect(res.status).toBe(404);
    });
  });

  describe("POST /api/tasks/:id/cancel", () => {
    it("should cancel a task", async () => {
      registry.register(createMockAdapter("claude-code", ["code"]));
      const created = await request(app).post("/api/tasks").send({ text: "test" });
      const res = await request(app).post(`/api/tasks/${created.body.id}/cancel`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("canceled");
    });
  });

  describe("GET /api/routing/stats", () => {
    it("should return routing stats", async () => {
      const res = await request(app).get("/api/routing/stats");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/server.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write server.ts implementation**

```typescript
// packages/relay/src/server.ts

import express from "express";
import cors from "cors";
import { createSSEHandler } from "./sse.js";
import type { LatticeDB } from "./db.js";
import type { LatticeRegistry } from "./registry.js";
import type { LatticeTaskManager } from "./task-manager.js";
import type { LatticeEventBus } from "./event-bus.js";

interface ServerDeps {
  db: LatticeDB;
  registry: LatticeRegistry;
  taskManager: LatticeTaskManager;
  bus: LatticeEventBus;
}

export function createApp({ db, registry, taskManager, bus }: ServerDeps) {
  const app = express();

  app.use(cors({ origin: /localhost/ }));
  app.use(express.json());

  // --- Agents ---

  app.get("/api/agents", (_req, res) => {
    const agents = registry.listAgents().map((a) => ({
      name: a.name,
      status: a.status,
      card: a.card,
    }));
    res.json(agents);
  });

  // --- Tasks ---

  app.post("/api/tasks", async (req, res) => {
    try {
      const { text, agent, execute } = req.body;
      if (!text) {
        res.status(400).json({ error: "text is required" });
        return;
      }

      const task = await taskManager.createTask(text, agent);

      if (execute) {
        const result = await taskManager.executeTask(task.id);
        res.status(201).json(result);
        return;
      }

      res.status(201).json(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/tasks", (_req, res) => {
    const status = _req.query.status as string | undefined;
    const tasks = taskManager.listTasks(status ? { status } : undefined);
    res.json(tasks);
  });

  app.get("/api/tasks/:id", (req, res) => {
    const task = taskManager.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(task);
  });

  app.post("/api/tasks/:id/cancel", (req, res) => {
    try {
      taskManager.cancelTask(req.params.id);
      const task = taskManager.getTask(req.params.id);
      res.json(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.post("/api/tasks/:id/input", (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        res.status(400).json({ error: "text is required" });
        return;
      }
      taskManager.provideInput(req.params.id, text);
      const task = taskManager.getTask(req.params.id);
      res.json(task);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // --- Routing Stats ---

  app.get("/api/routing/stats", (_req, res) => {
    res.json(db.getRoutingStats());
  });

  // --- SSE ---

  app.get("/api/events", createSSEHandler(bus));

  return app;
}
```

- [ ] **Step 4: Write index.ts library re-exports**

```typescript
// packages/relay/src/index.ts

export { createDatabase } from "./db.js";
export { createEventBus } from "./event-bus.js";
export { createRegistry } from "./registry.js";
export { createRouter } from "./router.js";
export { createTaskManager } from "./task-manager.js";
export { createSSEHandler } from "./sse.js";
export { createApp } from "./server.js";

export type { LatticeDB } from "./db.js";
export type { LatticeEventBus } from "./event-bus.js";
export type { LatticeRegistry } from "./registry.js";
export type { LatticeRouter } from "./router.js";
export type { LatticeTaskManager } from "./task-manager.js";
```

- [ ] **Step 4b: Write main.ts startup script**

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

// Read config
const configPath = path.resolve(process.cwd(), "lattice.config.json");
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
  : { relay: { port: 3100, host: "localhost" } };

const port = config.relay?.port ?? 3100;
const host = config.relay?.host ?? "localhost";

// Initialize components
const db = createDatabase(path.resolve(process.cwd(), "lattice.db"));
const bus = createEventBus();
const registry = createRegistry(db, bus);
const router = createRouter(registry);
const taskManager = createTaskManager(db, bus, registry, router);
const app = createApp({ db, registry, taskManager, bus });

// Start server
app.listen(port, host, () => {
  console.log(`Lattice relay server running at http://${host}:${port}`);
  console.log(`SSE endpoint: http://${host}:${port}/api/events`);
  console.log(`Agents registered: ${registry.listAgents().length}`);
});

// Health check interval
setInterval(() => registry.runHealthChecks(), 30_000);
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/server.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Run all tests to verify nothing is broken**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/
```

Expected: all tests PASS across all test files.

- [ ] **Step 7: Commit**

```bash
cd ~/lattice && git add packages/relay/src/server.ts packages/relay/src/index.ts packages/relay/src/main.ts packages/relay/tests/server.test.ts && git commit -m "feat: add Express server with REST API routes, SSE, CORS, and startup script"
```

---

### Task 10: Integration Smoke Test

**Files:**
- Create: `packages/relay/tests/integration.test.ts`

- [ ] **Step 1: Write the integration test**

This test boots the full stack and verifies the end-to-end flow: register agent, create task, execute, verify SSE events.

```typescript
// packages/relay/tests/integration.test.ts

import { describe, it, expect, vi, afterEach } from "vitest";
import http from "http";
import { createApp } from "../src/server.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import { createRegistry } from "../src/registry.js";
import { createRouter } from "../src/router.js";
import { createTaskManager } from "../src/task-manager.js";
import type { LatticeAdapter, AgentCard, Task } from "@lattice/adapter-base";

function createMockAdapter(name: string): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Integration test ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: true, pushNotifications: false },
    skills: [
      { id: "coding", name: "Coding", description: "Write code", tags: ["code", "debug", "fix"] },
    ],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn().mockImplementation(async (task: Task): Promise<Task> => ({
      ...task,
      status: "completed",
      artifacts: [{ name: "fix", parts: [{ type: "text", text: "Bug fixed in auth.ts line 42" }] }],
    })),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("Integration: full task lifecycle", () => {
  let server: http.Server;
  let baseUrl: string;

  afterEach(() => {
    server?.close();
  });

  it("should register an agent, create a task, execute it, and receive SSE events", async () => {
    const db = createDatabase(":memory:");
    const bus = createEventBus();
    const registry = createRegistry(db, bus);
    const router = createRouter(registry);
    const taskManager = createTaskManager(db, bus, registry, router);
    const app = createApp({ db, registry, taskManager, bus });

    // Register mock agent
    registry.register(createMockAdapter("claude-code"));

    // Start server
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });

    // Verify agent is listed
    const agentsRes = await fetch(`${baseUrl}/api/agents`);
    const agents = await agentsRes.json();
    expect(agents).toHaveLength(1);
    expect(agents[0].name).toBe("claude-code");

    // Create and execute a task
    const taskRes = await fetch(`${baseUrl}/api/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "fix the bug in auth.ts", execute: true }),
    });
    const task = await taskRes.json();

    expect(task.status).toBe("completed");
    expect(task.metadata.assignedAgent).toBe("claude-code");
    expect(task.artifacts).toHaveLength(1);
    expect(task.artifacts[0].parts[0].text).toContain("Bug fixed");

    // Verify task appears in history
    const historyRes = await fetch(`${baseUrl}/api/tasks`);
    const history = await historyRes.json();
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe(task.id);

    // Verify SSE buffer has events
    const events = bus.getBufferedEvents();
    const eventTypes = events.map((e) => e.event.type);
    expect(eventTypes).toContain("agent:registered");
    expect(eventTypes).toContain("task:created");
    expect(eventTypes).toContain("task:routed");
    expect(eventTypes).toContain("task:completed");
  });
});
```

- [ ] **Step 2: Run the integration test**

```bash
cd ~/lattice && npx vitest run packages/relay/tests/integration.test.ts
```

Expected: PASS — full lifecycle works end-to-end.

- [ ] **Step 3: Run all tests one final time**

```bash
cd ~/lattice && npx vitest run
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
cd ~/lattice && git add packages/relay/tests/integration.test.ts && git commit -m "test: add integration smoke test for full task lifecycle"
```

---

## Phase 1 Complete Checklist

After all tasks are done, verify:

- [ ] Monorepo builds cleanly: `npm run build`
- [ ] All tests pass: `npx vitest run`
- [ ] Relay server starts: `npx tsx packages/relay/src/main.ts`
- [ ] `GET /api/agents` returns `[]`
- [ ] `GET /api/events` opens SSE stream
- [ ] All A2A types are exported from `@lattice/adapter-base`
- [ ] `LatticeAdapter` interface is ready for Phase 2 adapter implementations

**Next:** Phase 2 plans (adapters, dashboard shell, CLI) can now be written and executed in parallel.
