# Lattice

## What This Is

Lattice is a unified control plane for AI agent orchestration via the A2A (Agent-to-Agent) protocol. Portfolio/demo project with open-source potential.

**Tagline:** "Connect your AI agents. Orchestrate everything."

## Architecture

**Approach C: A2A-Compatible Core, Progressive Fidelity**
- Relay exposes A2A-compliant JSON-RPC endpoints and uses A2A data models from day one
- Adapters start as in-process TypeScript modules (no separate HTTP servers)
- Extracting to separate processes later is a mechanical refactor
- Demo looks identical to a fully distributed architecture

## Tech Stack

- **Relay:** Node.js + Express + JSON-RPC 2.0
- **Database:** SQLite via better-sqlite3
- **Types/Adapters:** TypeScript
- **CLI:** TypeScript + Commander.js
- **Dashboard:** React + Vite + Tailwind + shadcn/ui + React Flow + Framer Motion + Zustand
- **Build:** tsup, npm workspaces, Vitest

## Project Structure

```
lattice/
├── packages/
│   ├── adapters/
│   │   ├── base/           # A2A types + LatticeAdapter interface (DONE)
│   │   ├── claude-code/    # Claude Code SDK wrapper (Phase 2)
│   │   ├── openclaw/       # OpenClaw WebSocket gateway wrapper (Phase 2)
│   │   └── codex/          # Codex CLI wrapper (Phase 2)
│   ├── relay/              # Core relay server (DONE - Phase 1)
│   │   ├── src/
│   │   │   ├── db.ts             # SQLite schema + queries
│   │   │   ├── event-bus.ts      # In-process pub/sub with ring buffer
│   │   │   ├── registry.ts      # Agent Card registry + health checks
│   │   │   ├── router.ts        # Skill-matching router (round-robin fallback)
│   │   │   ├── task-manager.ts   # Task lifecycle (create/route/execute/cancel)
│   │   │   ├── sse.ts           # SSE endpoint with Last-Event-ID replay
│   │   │   ├── server.ts        # Express app + REST routes
│   │   │   ├── index.ts         # Library re-exports
│   │   │   └── main.ts          # Startup script
│   │   └── tests/               # 45 tests, all passing
│   ├── cli/                # CLI tool (Phase 2)
│   └── dashboard/          # React dashboard (Phase 2)
├── workflows/              # Pre-built workflow JSON files (Phase 3)
├── docs/
│   ├── specs/              # Design spec
│   └── plans/              # Implementation plans
├── lattice.config.json
└── package.json
```

## Build Phases

### Phase 1 — Foundation (COMPLETE)
- Relay server + adapter interface + registry + router + task manager + event bus + SSE + Express server
- 45 tests passing across 8 test files
- 10 commits on main

### Phase 2 — Fan Out (NEXT — all parallel)
- **2a:** Claude Code Adapter — uses `@anthropic-ai/claude-code` SDK
- **2b:** OpenClaw Adapter — connects to gateway via WebSocket JSON-RPC, auth via OPENCLAW_GATEWAY_TOKEN
- **2c:** Codex Adapter — wraps CLI via child process
- **2d:** Dashboard Shell + Agent Overview — React + Vite + Tailwind + shadcn/ui, dark theme, SSE hook, Zustand store, agent cards grid, task dispatch bar
- **2e:** CLI — Commander.js thin wrapper over relay REST API

### Phase 3 — The Wow (parallel)
- **3a:** Flow Visualization — React Flow canvas with animated edges, message particles, neon effects
- **3b:** Workflow Engine — DAG executor with topological sort, parallel branches
- **3c:** Learned Router — Thompson Sampling multi-armed bandit

### Phase 4 — Integration
- **4a:** Workflow UI (editor + runner) — Editor drag-drop working, node palette + canvas + properties panel
- **4b:** Routing Stats UI
- **4c:** End-to-end polish + demo script

## React Flow Patterns (workflow editor)

The workflow editor uses React Flow as a controlled component with an external Zustand store. Key patterns:

- **Coordinate conversion:** Use `onInit` to capture `ReactFlowInstance`, then `rfInstance.screenToFlowPosition()` for drag-drop positioning. Do NOT use `useReactFlow()` from an outer `ReactFlowProvider`.
- **Stale closures:** `onNodesChange` and `onEdgesChange` callbacks must use `useRef` for `rfNodes`/`editorNodes`/`rfEdges` to avoid stale closure bugs. React Flow's `StoreUpdater` syncs callbacks via `useEffect`, so closure-captured state may be outdated when the callback fires.
- **Dimension changes:** Filter `type: "dimensions"` out of `onNodesChange` — syncing dimensions back to external state causes infinite render loops. React Flow tracks dimensions internally.

## Key API Contract (Phase 1 provides this)

```
GET    /api/agents                # List agents + status
POST   /api/tasks                 # Create task { text, agent?, execute? }
GET    /api/tasks                 # List tasks (filterable by ?status=)
GET    /api/tasks/:id             # Task detail
POST   /api/tasks/:id/cancel      # Cancel
POST   /api/tasks/:id/input       # Additional input for input-required tasks
GET    /api/routing/stats         # Router performance
GET    /api/events                # SSE stream (real-time events)
```

## SSE Event Types

```
agent:registered, agent:deregistered, agent:status
task:created, task:routed, task:progress, task:completed, task:failed, task:canceled, task:input-required
workflow:started, workflow:step, workflow:completed
message:sent, message:received
```

## Adapter Interface

```typescript
interface LatticeAdapter {
  getAgentCard(): AgentCard;
  executeTask(task: Task): Promise<Task>;
  streamTask(task: Task): AsyncGenerator<TaskStatusUpdate>;
  healthCheck(): Promise<boolean>;
}
```

All types exported from `@lattice/adapter-base`.

## Config

`lattice.config.json` at project root. Relay port 3100, dashboard port 3200. CORS enabled for localhost origins. No auth in v1.

## Running

```bash
npm install                          # Install all workspace deps
npx vitest run                       # Run all tests (195 passing)
npx tsx packages/relay/src/main.ts   # Start relay server on :3100
```

## Docs

- Full design spec: `docs/specs/2026-03-21-lattice-design.md`
- Phase 1 plan: `docs/plans/2026-03-21-lattice-phase1-relay-server.md`
