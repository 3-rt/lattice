# Lattice

Connect your AI agents. Orchestrate everything.

Lattice is a local control plane for AI agent orchestration over the A2A model. It combines a relay server, real-time dashboard, CLI, learned router, and workflow engine so multiple agents can collaborate on tasks and long-running flows.

## Architecture

```text
Dashboard (React + Vite)  <---- SSE ---->  Relay (Express + SQLite)  <---- REST ---->  CLI
                                                  |
                                                  +---- Claude Code adapter
                                                  +---- OpenClaw adapter
                                                  +---- Codex adapter
```

- Relay: registry, task manager, learned router, workflow engine, SSE stream, SQLite persistence
- Dashboard: agent overview, live flow, task history, routing stats, workflow editor/runner
- CLI: thin wrapper around relay REST endpoints
- Workflows: seeded JSON DAGs under `workflows/`

## Quick Start

```bash
npm install
npx vitest run
npm run dev:relay
npm run dev:dashboard
```

Or run both UI surfaces together:

```bash
npm run dev:all
```

For a one-shot relay boot:

```bash
npm start
```

## Core Commands

```bash
# Relay + dashboard
npm run dev:relay
npm run dev:dashboard
npm run dev:all

# Tests
npx vitest run
npm run test:smoke

# CLI examples
npx lattice agents
npx lattice send "Fix the bug in auth.ts"
npx lattice workflow list
npx lattice workflow run <workflow-id>
npx lattice routing
```

## REST API

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/api/agents` | List agents and status |
| POST | `/api/tasks` | Create a task |
| GET | `/api/tasks` | List tasks |
| GET | `/api/tasks/:id` | Fetch a task |
| POST | `/api/tasks/:id/cancel` | Cancel a task |
| POST | `/api/tasks/:id/input` | Provide task input |
| GET | `/api/routing/stats` | Routing statistics |
| GET | `/api/workflows` | List workflows |
| POST | `/api/workflows` | Create a workflow |
| POST | `/api/workflows/:id/run` | Run a workflow |
| GET | `/api/workflows/:id/runs` | List workflow runs |
| GET | `/api/events` | SSE event stream |

## Demo Workflows

- `Bug Fix Pipeline`
- `Code Review`

These are seeded automatically from the `workflows/` directory when the relay starts.

## Config

All runtime configuration lives in [lattice.config.json](./lattice.config.json), including relay ports, adapter enablement, routing strategy, and the workflow seed directory.
