---
name: feature-test
description: Test a feature end-to-end by starting the server, exercising the API, and checking dashboard behavior
---

# Feature Testing

When the user wants to verify a feature works end-to-end:

## Process

1. **Identify what to test** — understand the feature and its expected behavior
2. **Start the relay** (if not running) — `npx tsx packages/relay/src/main.ts --demo &`
3. **Exercise the API** — use curl to hit the relevant endpoints:
   ```bash
   # Create a task
   curl -s -X POST http://localhost:3100/api/tasks \
     -H 'Content-Type: application/json' \
     -d '{"text": "test prompt", "execute": true}'

   # Check task status
   curl -s http://localhost:3100/api/tasks/<id>

   # List agents
   curl -s http://localhost:3100/api/agents

   # Check routing stats
   curl -s http://localhost:3100/api/routing/stats
   ```
4. **Check SSE events** — `curl -s -N http://localhost:3100/api/events &` to watch real-time events
5. **Verify dashboard** — tell the user to check `http://localhost:3200` and ask what they see
6. **If something's wrong** — use the test-debugger agent pattern to trace the issue

## Common Features to Test
- Agent registration and health checks
- Task creation and routing
- Workflow execution (start a workflow, watch steps complete)
- SSE event delivery
- Dashboard reflecting live state
