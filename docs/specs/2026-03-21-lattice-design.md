# Lattice Design Spec

## Overview

Lattice is a unified control plane that makes any AI agent on your machine discoverable and orchestratable via the A2A (Agent-to-Agent) protocol. It provides a relay server, CLI, visual dashboard with real-time message flow visualization, a workflow engine for chaining multi-agent tasks, and a learned routing system.

**Tagline:** "Connect your AI agents. Orchestrate everything."

**Motivation:** Portfolio/demo project with open-source potential. The dashboard is the showpiece — visually stunning real-time flow visualization backed by genuinely working multi-agent orchestration.

**Target Agents:** Claude Code (primary), OpenClaw (priority for cross-agent demo), Codex (third agent for visual richness).

---

## Architectural Approach: A2A-Compatible Core, Progressive Fidelity

The relay exposes A2A-compliant JSON-RPC endpoints and uses A2A data models (Agent Cards, Tasks, Artifacts) from day one. However, adapters start as **in-process TypeScript modules** that the relay calls directly, rather than each running their own HTTP server.

**Why this approach:**
- Fast to build — no inter-process HTTP overhead, simpler debugging
- Architecturally honest — the relay's external API is real A2A, adapters implement the same interface they would as standalone servers
- Extracting adapters to separate processes later is a mechanical refactor (add HTTP transport), not a redesign
- Demo looks identical to a fully distributed architecture

---

## Sub-Project Decomposition & Build Order

### Phase 1 — Foundation (sequential, everything depends on this)
**Sub-project 1: Relay Server + Adapter Interface + Registry**
- Express server with A2A-compliant JSON-RPC endpoint
- Agent Card registry
- Task manager
- SQLite database
- Event bus + SSE endpoint
- Base adapter interface

### Phase 2 — Fan Out (all parallel)
- **2a: Claude Code Adapter** — Backend session
- **2b: OpenClaw Adapter** — Backend session or second session
- **2c: Codex Adapter** — Codex generates its own adapter
- **2d: Dashboard Shell + Agent Overview** — Frontend session
- **2e: CLI** — Codex generates from API spec

### Phase 3 — The Wow (parallel)
- **3a: Flow Visualization** — Frontend session (marquee feature)
- **3b: Workflow Engine** — Backend session
- **3c: Learned Router** — Backend session

### Phase 4 — Integration
- **4a: Workflow UI** (editor + runner) — Frontend session
- **4b: Routing Stats UI** — Frontend session
- **4c: End-to-end polish + demo script** — Both sessions

**Key decoupling point:** The SSE event contract and REST API contract from Phase 1 decouple frontend and backend work completely.

---

## Relay Server Architecture

### Process Model
Single Node.js process. Adapters run in-process as TypeScript modules. Two interfaces:
- **A2A JSON-RPC endpoint** (`POST /a2a/jsonrpc`) — spec-compliant
- **REST API** (`/api/*`) — for dashboard and CLI

### Core Modules

**Registry** (`registry.ts`)
- In-memory Map of agent name -> AgentCard + adapter instance
- On startup, reads `lattice.config.json`, instantiates enabled adapters, registers them
- Persists to SQLite for restart recovery
- Heartbeat: polls `adapter.healthCheck()` every 30s, emits SSE events on status change

**Task Manager** (`task-manager.ts`)
- Creates tasks with UUIDs, persists to SQLite
- Routes to adapter via router, calls `adapter.executeTask(task)`
- Updates task status through lifecycle: `submitted -> working -> completed/failed/canceled`
- `input-required`: if an adapter signals it needs more info, the task enters this state. The relay emits a `task:input-required` SSE event. The user can provide additional input via `POST /api/tasks/:id/input`, which appends to the task's history and resumes execution.
- `canceled`: triggered via `POST /api/tasks/:id/cancel`. Adapter's in-flight work is aborted if possible. Emits `task:canceled` SSE event.
- Emits SSE events at each state transition
- Supports streaming: if adapter returns AsyncGenerator, relays progress events via SSE
- **Error handling:** if `adapter.executeTask()` throws, the task is marked `failed` with the error message stored in `tasks.result` as `{ "error": "<message>" }`. No automatic retry — the user or workflow engine decides whether to retry. Task execution has a configurable timeout (default: 5 minutes); exceeded timeout marks the task as `failed`.

**Router** (`router.ts`)
- Phase 1: simple skill-matching — tokenize task text into lowercase words, match against each agent's skill tags. Score = number of matching tags. Highest score wins. Ties broken by registration order. Zero matches fall through to round-robin across all online agents.
- Phase 3: learned router layered on top (Thompson Sampling)
- Respects explicit `--to <agent>` override

**Event Bus** (`event-bus.ts`)
- In-process pub/sub (EventEmitter)
- All state changes publish events here
- SSE endpoint subscribes and forwards to dashboards

**SSE Endpoint** (`GET /api/events`)
- Standard SSE stream
- Each event has an incrementing integer ID
- On reconnect, client sends `Last-Event-ID` header; server replays all events after that ID from the ring buffer (max 50 retained)
- If no `Last-Event-ID`, replays all buffered events
- Event types listed below

### Database
SQLite via better-sqlite3 (synchronous API). No `events` table — SSE events are ephemeral with in-memory ring buffer for replay.

```sql
CREATE TABLE agents (
  name TEXT PRIMARY KEY,
  agent_card JSON NOT NULL,
  status TEXT DEFAULT 'online',
  registered_at TEXT DEFAULT (datetime('now')),
  last_heartbeat TEXT
);

CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  assigned_agent TEXT,
  history JSON NOT NULL,       -- serialized Message[] array (full conversation history)
  result JSON,                 -- on success: serialized Artifact[]; on failure: { "error": "..." }
  routing_reason TEXT,
  latency_ms INTEGER,
  cost REAL,
  workflow_id TEXT,
  workflow_step_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (assigned_agent) REFERENCES agents(name)
);

CREATE TABLE routing_stats (
  agent_name TEXT NOT NULL,
  task_category TEXT NOT NULL,
  successes INTEGER DEFAULT 0,
  failures INTEGER DEFAULT 0,
  total_latency_ms INTEGER DEFAULT 0,
  total_cost REAL DEFAULT 0,
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (agent_name, task_category)
);

CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  definition JSON NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  status TEXT DEFAULT 'running',
  current_step TEXT,
  context JSON DEFAULT '{}',
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  FOREIGN KEY (workflow_id) REFERENCES workflows(id)
);
```

### API Contract

```
POST   /a2a/jsonrpc              # A2A spec (JSON-RPC 2.0)
GET    /api/agents                # List agents + status
POST   /api/tasks                 # Create task (auto-routed or explicit)
GET    /api/tasks                 # List tasks (filterable)
GET    /api/tasks/:id             # Task detail
POST   /api/tasks/:id/cancel      # Cancel
POST   /api/tasks/:id/input       # Provide additional input (for input-required state)
GET    /api/workflows             # List workflows
POST   /api/workflows             # Create workflow
POST   /api/workflows/:id/run     # Run workflow
GET    /api/workflows/:id/runs    # List runs
GET    /api/routing/stats         # Router performance
GET    /api/events                # SSE stream
```

### SSE Event Types

```typescript
type SSEEvent =
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

---

## Adapter Interface & Implementations

### Base Interface

```typescript
interface LatticeAdapter {
  getAgentCard(): AgentCard;
  executeTask(task: Task): Promise<Task>;
  streamTask(task: Task): AsyncGenerator<TaskStatusUpdate>;
  healthCheck(): Promise<boolean>;
}

interface TaskStatusUpdate {
  taskId: string;
  status: Task["status"];
  message?: string;           // human-readable progress update
  artifacts?: Artifact[];     // partial results (for streaming)
}
```

No `startServer()`/`stopServer()` — adapters are in-process modules. These methods get added when extracting to separate processes later.

### A2A Data Models

```typescript
interface AgentCard {
  name: string;
  description: string;
  url: string;                     // For in-process adapters: relay URL with agent path, e.g. "http://localhost:3100/a2a/agents/claude-code". When extracted to separate processes, this becomes the adapter's own URL.
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

interface Skill {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

interface Task {
  id: string;
  status: "submitted" | "working" | "input-required" | "completed" | "failed" | "canceled";
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

interface Message {
  role: "user" | "agent";
  parts: Part[];
}

interface Part {
  type: "text" | "file" | "data";
  text?: string;
  file?: { name: string; mimeType: string; bytes: string };
  data?: Record<string, unknown>;
}

interface Artifact {
  name: string;
  parts: Part[];
}
```

### Claude Code Adapter
- Uses `@anthropic-ai/claude-code` SDK for programmatic access
- Maps A2A Task -> SDK conversation prompt, SDK response -> A2A Artifact
- Skills: `code-generation`, `code-review`, `debugging`, `refactoring`, `git-operations`
- Streaming supported via SDK streaming API -> `streamTask` yields progress updates

### OpenClaw Adapter
- Connects to OpenClaw gateway via WebSocket JSON-RPC (`ws://<host>:<port>/ws`)
- Protocol: receives `connect.challenge`, responds with `connect` (protocol v3, token auth), then uses `chat.send` RPC for task execution
- Auth via `OPENCLAW_GATEWAY_TOKEN` env var, passed as `auth.token` in the connect handshake
- Skills: `messaging`, `scheduling`, `web-browsing`, `file-management`
- Key demo moment: cross-agent task (Claude Code fix -> OpenClaw sends Telegram notification)

### Codex Adapter
- Wraps Codex CLI via child process (`codex --quiet` for non-interactive output)
- Skills: `code-generation`, `code-review`, `terminal-commands`
- Output format: Codex outputs markdown text to stdout. Exit code 0 = success, non-zero = failure. Stderr captured as error detail.
- Working directory: set to the project root (configurable via `lattice.config.json`)
- Parses CLI stdout into a single text Artifact

### Adapter Priority
1. Claude Code — must work flawlessly
2. OpenClaw — must work for cross-agent "wow" moment
3. Codex — nice-to-have third agent

---

## Dashboard & Flow Visualization

### Tech Stack
- React + Vite + Tailwind + shadcn/ui
- React Flow for flow visualization and workflow editor
- Framer Motion for animations
- Zustand for global state
- Dark theme by default

### Layout
Single-page app, sidebar nav, four views:

**1. Agent Overview (home)**
- Grid of agent cards: name, status (animated online/offline indicator), skill tags, live stats
- Cards pulse/glow when agent is actively working
- **Task Dispatch bar** at the top: text input for task description, optional agent selector dropdown (defaults to "auto-route"), send button. Present on this view and the Live Flow view.

**2. Live Flow (marquee view)**
- React Flow canvas with agent nodes
- Animated edges light up when tasks are routed
- Message "particles" travel along edges showing data flow
- Multi-agent workflows light up step by step
- Side panel with live task log streaming
- Neon/glowing edge effect when active
- Agent nodes "breathe" when idle, intensify when working

**3. Task History**
- Table: status, assigned agent, latency, routing reason
- Click to expand full input/output
- Filterable by agent, status, time range

**4. Workflows**
- **Editor:** React Flow canvas, drag pre-made node blocks (agent task, condition), connect with edges. Conditions via dropdowns (no custom JS).
- **Runner:** Select workflow, hit run, watch execution in flow visualization scoped to the DAG

### Real-time Connection
- Single SSE connection via `useSSE` hook
- Events update Zustand store
- All views react to same event stream

### Visual Polish
- Smooth animations on every state transition
- Glowing/neon edges when active
- Breathing animation on idle nodes
- No jarring updates

---

## Workflow Engine

### DAG Executor (`workflow-engine.ts`)
- Workflows stored as JSON (nodes + edges) in SQLite
- Execution: topological sort, execute respecting dependencies
- Parallel branches execute concurrently (Promise.all on satisfied nodes)
- Each node creates a real A2A task via task manager (appears in flow visualization)
- Context object: each node's output stored by node ID in a `context` map

### Node Types
- `agent-task` — routes to specific agent or "auto" for learned routing
- `condition` — evaluates simple rule against previous node output. Preset operators: `equals`, `not_equals`, `contains`, `not_contains`, `is_empty`, `not_empty`. Operands reference context values via dot notation (e.g., `nodeId.status`). String comparison only in v1.

### Edge Data Mapping
Edges define how output flows between nodes. Each edge has an optional `dataMapping` that copies values from the source node's output into the target node's input. Uses dot notation for paths into the context: `{ "source_field": "target_field" }`. Example: `{ "artifacts[0].parts[0].text": "taskDescription" }` takes the first artifact's text from the source node and passes it as `taskDescription` to the target node's task template. Templates in `taskTemplate` reference mapped values via `{{variableName}}`.

### Pre-built Demo Workflows
1. **Bug Fix Pipeline:** User describes bug -> Claude Code fixes -> Codex reviews -> OpenClaw notifies on Telegram
2. **Code Review:** User points to PR -> Claude Code reviews -> OpenClaw sends summary

### Workflow API
- CRUD on definitions
- `POST /api/workflows/:id/run` starts execution, returns run ID
- Run status and step progress emitted as SSE events

---

## Learned Router

### Algorithm: Thompson Sampling
- Each (agent, task_category) pair has success/failure counts in SQLite
- Task categorization via keyword matching against predefined map
- For each capable agent: sample from `Beta(successes + 1, failures + 1)`
- Pick agent with highest sample
- After task completes/fails, update counts

### Success Definition
- `completed` status -> success
- `failed` or `canceled` -> failure
- Latency and cost tracked but not used for routing in v1

### Properties
- Converges to best agent per category after ~20 tasks
- Naturally balances exploration and exploitation
- Demo moment: stats dashboard shows convergence ("Claude Code reaches 92% on coding tasks")
- Fallback: round-robin on cold start

---

## CLI

Thin wrapper over relay REST API using Commander.js.

```
lattice start                        # Boot relay + enabled adapters
lattice start --adapters claude-code,openclaw
lattice agents                       # List agents (pretty table)
lattice send "<task>"                 # Create task, stream progress via SSE
lattice send "<task>" --to openclaw   # Route to specific agent
lattice status                       # Relay health + agent statuses
lattice workflow list                 # List workflows
lattice workflow run <name>           # Run workflow, stream progress
lattice routing stats                 # Show routing performance table
```

**`lattice start`:** reads config, instantiates relay + adapters, starts Express, prints status, stays running.

**`lattice send`:** POSTs task, opens SSE connection filtered to task ID, streams progress, exits on completion/failure.

---

## Monorepo Structure

```
lattice/
├── packages/
│   ├── relay/              # Relay server + task manager + router + workflow engine
│   │   └── src/
│   │       ├── server.ts
│   │       ├── registry.ts
│   │       ├── router.ts
│   │       ├── task-manager.ts
│   │       ├── workflow-engine.ts
│   │       ├── event-bus.ts
│   │       ├── db.ts
│   │       └── sse.ts
│   ├── adapters/
│   │   ├── base/            # Adapter interface + A2A shared types
│   │   ├── claude-code/
│   │   ├── openclaw/
│   │   └── codex/
│   ├── cli/
│   └── dashboard/
├── workflows/               # Pre-built workflow JSON files
│   ├── bug-fix-pipeline.json
│   └── code-review.json
├── lattice.config.json
├── package.json             # npm workspaces root
└── tsconfig.json
```

### CORS & Auth
- Relay enables CORS for `localhost:*` origins (dashboard runs on different port)
- No authentication in v1 — all endpoints are open. This is a local-only tool. Auth can be added later for the open-source version.

### Build Tooling
- TypeScript with tsup for fast builds
- npm workspaces for dependency management
- Each package extends root tsconfig
- Dashboard: Vite dev server
- `npm run dev` at root: relay watch mode + Vite dev server

---

## Config File

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

---

## Demo Script

1. `npx lattice start` — boots relay + adapters
2. Open dashboard at localhost:3200
3. Show three agents registered: Claude Code, OpenClaw, Codex
4. Type "fix the bug in auth.ts" in the dispatch box
5. Watch the message flow visualization light up in real-time
6. Claude Code picks up the task, streams progress
7. Task completes, show the result in task history
8. Switch to workflow editor
9. Show pre-built workflow: bug description -> Claude Code fix -> Codex review -> OpenClaw notify
10. Trigger the workflow, watch all agents coordinate in the flow visualization
11. Show routing stats: "Claude Code has 92% success on coding tasks"

---

## Success Metrics

- 3+ agents registered and communicating via A2A
- Real-time message flow visualization working with smooth animations
- At least 1 multi-step workflow executing end-to-end
- Learned router showing measurable improvement after 20+ tasks
- Clean README with architecture diagram and demo GIF
- Published to npm
