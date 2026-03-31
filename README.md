# Lattice

**Connect your AI agents. Orchestrate everything.**

Lattice is a local control plane for AI agent orchestration using the [A2A (Agent-to-Agent)](https://github.com/google/A2A) protocol. It combines a relay server, real-time dashboard, CLI, learned router, and workflow engine so multiple AI coding agents can collaborate on tasks and multi-step flows.

## Architecture

```
Dashboard (React + Vite)  ◄──── SSE ────►  Relay (Express + SQLite)  ◄──── REST ────►  CLI
                                                   │
                                                   ├── Claude Code adapter
                                                   ├── OpenClaw adapter
                                                   └── Codex adapter
```

- **Relay** — Agent registry, task manager, learned router (Thompson Sampling), workflow engine (DAG executor), SSE event stream, SQLite persistence
- **Dashboard** — Agent overview, live flow visualization (React Flow), task history, routing stats, workflow editor/runner
- **CLI** — Thin wrapper around the relay REST API
- **Adapters** — In-process TypeScript modules implementing the `LatticeAdapter` interface. Claude Code runs via CLI subprocess, OpenClaw connects to its gateway over WebSocket JSON-RPC, Codex wraps its CLI.

## Quick Start

```bash
# Install dependencies
npm install

# Run tests
npx vitest run

# Set env vars for adapters you want to use (see docs/setup-openclaw.md for OpenClaw)
export OPENCLAW_GATEWAY_TOKEN="your-gateway-token"
export OPENCLAW_DEVICE_TOKEN="your-device-token"

# Start the relay server (port 3100)
npm start

# In another terminal, start the dashboard (port 3200)
npm run dev:dashboard

# Open the dashboard
open http://localhost:3200
```

> **Note:** If agents show as unregistered or the relay starts with 0 agents, delete the stale database and restart:
> ```bash
> rm -f lattice.db lattice.db-shm lattice.db-wal
> npm start
> ```

Or start both at once:

```bash
npm run dev:all
```

## Prerequisites

The relay and dashboard run without any external agents. To actually execute tasks, you need one or more of:

| Adapter | Requirement |
|---------|-------------|
| Claude Code | `claude` CLI on PATH, authenticated via `claude auth` |
| OpenClaw | `OPENCLAW_GATEWAY_TOKEN` + `OPENCLAW_DEVICE_TOKEN` env vars, device identity file, gateway reachable via WebSocket |
| Codex | `codex` CLI on PATH |

OpenClaw requires the most setup — see [`docs/setup-openclaw.md`](docs/setup-openclaw.md) for the full guide.

Disable any adapter in `lattice.config.json` by setting `"enabled": false`.

## CLI

```bash
npx lattice agents                    # List registered agents
npx lattice send "Fix the bug"        # Dispatch a task
npx lattice workflow list             # List workflows
npx lattice workflow run <id>         # Run a workflow
npx lattice routing                   # Show routing stats
```

## REST API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/agents` | List agents and status |
| `POST` | `/api/tasks` | Create a task (`{ text, agent?, execute? }`) |
| `GET` | `/api/tasks` | List tasks (filterable by `?status=`) |
| `GET` | `/api/tasks/:id` | Task detail |
| `POST` | `/api/tasks/:id/cancel` | Cancel a task |
| `POST` | `/api/tasks/:id/input` | Provide input for `input-required` tasks |
| `GET` | `/api/routing/stats` | Routing performance statistics |
| `GET` | `/api/workflows` | List workflows |
| `POST` | `/api/workflows` | Create a workflow |
| `POST` | `/api/workflows/:id/run` | Run a workflow |
| `GET` | `/api/workflows/:id/runs` | List workflow runs |
| `GET` | `/api/events` | SSE event stream |

## SSE Events

```
agent:registered, agent:deregistered, agent:status
task:created, task:routed, task:progress, task:completed, task:failed, task:canceled, task:input-required
workflow:started, workflow:step, workflow:completed
message:sent, message:received
```

## Project Structure

```
lattice/
├── packages/
│   ├── adapters/
│   │   ├── base/           # A2A types + LatticeAdapter interface
│   │   ├── claude-code/    # Claude Code CLI subprocess wrapper
│   │   ├── openclaw/       # OpenClaw WebSocket gateway wrapper
│   │   └── codex/          # Codex CLI wrapper
│   ├── relay/              # Core relay server
│   ├── cli/                # Commander.js CLI
│   └── dashboard/          # React + Vite + Tailwind dashboard
├── workflows/              # Seeded workflow JSON definitions
├── docs/
│   ├── specs/              # Design spec
│   ├── plans/              # Implementation plans
│   └── demo-script.md      # Recording script (internal)
├── lattice.config.json     # Runtime configuration
└── package.json            # npm workspaces root
```

## Configuration

All runtime config lives in [`lattice.config.json`](./lattice.config.json):

```jsonc
{
  "relay": { "port": 3100 },
  "dashboard": { "port": 3200 },
  "adapters": {
    "claude-code": { "enabled": true },
    "openclaw": { "enabled": true, "gatewayUrl": "http://100.98.106.46:18789", "gatewayToken": "${OPENCLAW_GATEWAY_TOKEN}" },
    "codex": { "enabled": true }
  },
  "routing": { "strategy": "learned", "fallback": "round-robin" },
  "workflows": { "seedDir": "workflows" }
}
```

## Tech Stack

- **Runtime:** Node.js, Express, SQLite (better-sqlite3)
- **Frontend:** React, Vite, Tailwind CSS, shadcn/ui, React Flow, Framer Motion, Zustand
- **Build:** TypeScript, tsup, npm workspaces, Vitest

## License

[MIT](LICENSE)
