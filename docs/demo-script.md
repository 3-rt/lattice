# Lattice Demo

## Start

Terminal 1:
```bash
rm -f lattice.db lattice.db-shm lattice.db-wal   # clean slate
npm start
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

You land here. Two agents online (Claude Code, Codex), one offline (OpenClaw — needs gateway).

**Point out:**
- Each agent registers with skills (debugging, code review, messaging, etc.)
- The router uses these skills to decide who handles what
- Agents are pluggable — 4 methods to implement, and the system picks it up

## 2. Live Flow

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

**Dispatch a second task while explaining the architecture:**
```
What files in this project have the most lines of code? List the top 5.
```

Now you have two completed tasks visible, routed potentially to different agents.

## 3. Tasks page

Navigate to Tasks.

- Show the completed tasks with agent, status, latency
- **Click a row to expand** — show the routing reason ("thompson sampling, category: ...") and the full output
- **Switch to Routing Stats tab** — show success rates and latency by agent/category
- "As more tasks run, the router converges on the best agent for each type of work"

## 4. Workflows — the big moment

Navigate to Workflows.

### Editor tab (30 seconds)

- Show the node palette on the left (Agent Task, Condition)
- "You can build multi-step pipelines visually — drag nodes, draw edges, configure each step"
- Don't build one live — just show it exists

### Runner tab

- Select **"Incident Response"** (or "Bug Fix Pipeline" or "Code Review")
- Show the DAG visualization — point out it's a 5-step pipeline with a condition node
- **Click Run**
- Watch each node light up in sequence as it executes
- This takes ~30-60s with real agents — narrate each step:
  - "Step 1: Claude Code triages the incident"
  - "Step 2: Claude Code writes the fix"
  - "Step 3: Codex reviews it for security issues"
  - "Step 4: Condition check — did the review pass?"
  - "Step 5: Notify the team with a summary"

**After it completes:**
"That's 3 different AI agents coordinating on an incident — triage, fix, review, notification — orchestrated as a DAG with data flowing between steps."

## 5. Wrap up

Go back to Tasks — all the workflow tasks are now in the history.

**Key points:**
- "218 tests, all TypeScript, monorepo with npm workspaces"
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
