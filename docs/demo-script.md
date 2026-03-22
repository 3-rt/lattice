# Lattice Demo Script

## Prerequisites

```bash
npm install
export OPENCLAW_GATEWAY_TOKEN="your-token"
```

Ensure `claude`, `codex`, and the OpenClaw gateway are available if you want the full live demo.

## 1. Boot The System

Start the relay:

```bash
npm start
```

Expected output includes:

- adapter load messages
- workflow seeding summary
- relay URL
- SSE endpoint
- registered agent count

Start the dashboard in another terminal:

```bash
npm run dev:dashboard
```

Open `http://localhost:3200`.

## 2. Show The Dashboard

Walk through:

1. Agent Overview
2. Live Flow
3. Tasks
4. Workflows

Confirm the seeded workflows are visible on the Workflows page.

## 3. Dispatch A Single Task

Use the dashboard dispatch bar or CLI:

```bash
npx lattice send "Fix the bug in auth.ts"
```

Then show:

- live routing on the Flow page
- task details on the Tasks page
- routing stats after completion

## 4. Run A Workflow

Open the Workflows page and run `Bug Fix Pipeline`.

Call out:

- DAG editor + runner split
- step highlighting during execution
- multi-agent coordination across workflow steps

CLI equivalent:

```bash
npx lattice workflow list
npx lattice workflow run <workflow-id>
```

## 5. Show Routing Intelligence

Open Routing Stats and explain:

- success rate by agent/category
- average latency
- learned routing convergence over time

CLI equivalent:

```bash
npx lattice routing
```

## 6. Close With Architecture

Talking points:

- A2A-compatible adapters plug into a single relay
- dashboard state updates over SSE
- workflows are DAGs with conditions and data mapping
- routing improves from observed outcomes instead of static rules
