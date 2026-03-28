# Lattice Demo

## Prerequisites

- OpenClaw gateway running with Telegram channel configured (see `docs/setup-openclaw.md`)
- `OPENCLAW_GATEWAY_TOKEN` and `OPENCLAW_DEVICE_TOKEN` exported
- `.openclaw-device.json` in project root
- All three adapters should show as ready on startup

## Start

Terminal 1:
```bash
npm start
```

You should see:
```
  Adapters:
  ✓ claude-code     ready
  ✓ openclaw        ready
  ⚡ Bridge: listening for BUG: messages
  ✓ codex           ready

  Workflows:
    ✓ 4 existing workflow(s)
```

Terminal 2:
```bash
npm run dev:dashboard
```

Open http://localhost:3200

## The pitch (one sentence)

"Lattice is a control plane that connects multiple AI coding agents — Claude Code, Codex, others — routes tasks to the right one, and orchestrates multi-step workflows across them, all in real-time."

---

## 1. Agents page

You land here. Three agents online (Claude Code, Codex, OpenClaw).

**Point out:**
- Each agent registers with skills (debugging, code review, messaging, etc.)
- The router uses these skills to decide who handles what
- Agents are pluggable — 4 methods to implement, and the system picks it up

## 2. Live Flow — single task dispatch

Navigate to Live Flow. The relay is in the center, agents around it.

**Type in the dispatch bar:**
```
Look at the lattice project and suggest 3 improvements to the README
```

Watch it route to an agent. The edge glows, a particle travels along it, the agent node lights up blue while working, then turns green on completion. Events stream into the log on the right.

**While it's running (~10-20s), narrate:**
- "The router analyzed the task and matched it to [agent] based on skill tags"
- "This is all real-time over Server-Sent Events — no polling"
- "The routing uses Thompson Sampling — a Bayesian multi-armed bandit that learns which agent is best for which category"

## 3. Telegram Bridge — the big moment

This is the end-to-end demo: a real customer bug report comes in via Telegram, triggers a multi-agent workflow, and the customer gets a response — all orchestrated by Lattice.

**Have your phone ready with the Telegram chat open.**

### Setup the shot

- Dashboard open to **Live Flow** page (to show workflow executing in real-time)
- Phone visible with Telegram chat
- Terminal visible showing relay logs

### Send the bug report

On your phone, send this Telegram message to your OpenClaw bot:
```
BUG: dashboard freezes when uploading CSV files larger than 5MB. The page becomes unresponsive and I have to force-reload the browser.
```

### What happens (narrate as it unfolds)

1. **Telegram ack appears (~1s):** "Bug received. Investigating across agents..."
   - "Lattice intercepted the message via the OpenClaw gateway and sent an immediate acknowledgement"

2. **Dashboard lights up:** The Bug Triage Pipeline workflow starts executing on the Live Flow page
   - "Now Lattice is orchestrating a 3-agent workflow in real-time"

3. **Step 1 — Claude Code investigates (~15-30s):**
   - "Claude Code is investigating the bug — it has access to the full codebase and can actually look at the relevant code"

4. **Step 2 — Codex reviews (~15-30s):**
   - "Codex is reviewing the investigation for correctness — a second opinion from a different AI"

5. **Step 3 — OpenClaw composes reply (~10s):**
   - "OpenClaw is writing a customer-friendly response — no technical jargon, just what the customer needs to know"

6. **Telegram reply arrives:**
   - "And the customer gets their answer — investigated by two coding agents, composed by a third, all coordinated by Lattice"

**Total time: ~60-90 seconds from bug report to customer reply.**

### Note on OpenClaw auto-response

OpenClaw will also send its own auto-response to the Telegram message (it processes the message before the abort can fire). This is a known limitation — there's no per-session toggle to disable auto-response. The Lattice workflow reply arrives separately and is the real answer.

## 4. Tasks page

Navigate to Tasks.

- Show the completed tasks with agent, status, latency
- The workflow tasks from the bug triage are visible
- **Click a row to expand** — show the routing reason and the full output
- **Switch to Routing Stats tab** — show success rates and latency by agent/category

## 5. Workflows page

Navigate to Workflows.

### Editor tab (30 seconds)

- Show the node palette on the left (Agent Task, Condition)
- "You can build multi-step pipelines visually — drag nodes, draw edges, configure each step"
- Show the Bug Triage Pipeline in the editor — 3 nodes connected in sequence

### Runner tab

- Select a workflow and show the DAG visualization
- Point out data flows between nodes (output from one step feeds into the next)

## 6. Wrap up

**Key points:**
- "231 tests, all TypeScript, monorepo with npm workspaces"
- "Three real AI agents connected — Claude Code, Codex, OpenClaw — each with different strengths"
- "Real Telegram integration — a customer sends a message and gets a multi-agent response"
- "Adapters are pluggable — implement 4 methods and you have a new agent"
- "The learned router gets smarter over time from observed outcomes"
- "Everything runs locally, no cloud dependency"

---

## If they ask

**"How does the routing work?"**
Thompson Sampling — each agent/category pair gets a Beta distribution. The router samples from each and picks the highest. Starts uniform, converges on the best.

**"Can I add my own agents?"**
Implement `getAgentCard`, `executeTask`, `streamTask`, `healthCheck`. Register with the relay. Router, dashboard, and workflows pick it up automatically.

**"What's A2A?"**
Google's Agent-to-Agent protocol for AI interoperability — how agents advertise capabilities, receive tasks, and report results.

**"How does the Telegram bridge work?"**
Lattice subscribes to session events on the OpenClaw gateway via WebSocket. When a message starting with "BUG:" arrives, it intercepts it, sends an ack directly to Telegram via the gateway's `send` RPC, triggers a 3-step workflow (investigate → review → compose), and sends the final reply back to Telegram. The whole thing is event-driven — no polling.
