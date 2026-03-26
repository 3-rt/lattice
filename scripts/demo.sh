#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lattice Demo — self-contained showcase of the AI agent orchestration platform
#
# Starts the relay in demo mode (mock agents), launches the dashboard,
# dispatches tasks, runs a workflow, and displays routing intelligence.
#
# Usage:
#   bash demo.sh              # Full interactive demo
#   bash demo.sh --headless   # Skip browser open (CI / recording)
# ─────────────────────────────────────────────────────────────────────────────

BASE="$(cd "$(dirname "$0")" && pwd)"
cd "$BASE"

RELAY="http://localhost:3100"
DASH="http://localhost:3200"
PID_FILE="$BASE/.demo-relay.pid"
DASH_PID_FILE="$BASE/.demo-dashboard.pid"
HEADLESS=false
[[ "$*" == *--headless* ]] && HEADLESS=true

# ── Colors ───────────────────────────────────────────────────────────────────

bold()   { printf "\033[1m%s\033[0m\n"   "$*"; }
green()  { printf "\033[32m%s\033[0m\n"  "$*"; }
cyan()   { printf "\033[36m%s\033[0m\n"  "$*"; }
yellow() { printf "\033[33m%s\033[0m\n"  "$*"; }
dim()    { printf "\033[2m%s\033[0m\n"   "$*"; }
red()    { printf "\033[31m%s\033[0m\n"  "$*"; }

# ── Helpers ──────────────────────────────────────────────────────────────────

relay_running() { curl -sf "$RELAY/api/agents" > /dev/null 2>&1; }

wait_for_relay() {
  local i=0
  while ! relay_running; do
    sleep 0.5; i=$((i + 1))
    if [ $i -ge 30 ]; then
      red "Relay did not start in 15s"
      cat /tmp/lattice-demo-relay.log 2>/dev/null || true
      exit 1
    fi
  done
}

pause() {
  if [ "$HEADLESS" = false ]; then
    dim "  Press Enter to continue..."; read -r
  else
    sleep "${1:-2}"
  fi
}

section() {
  echo ""
  printf "  \033[1;36m── %s ──\033[0m\n" "$1"
  echo ""
}

step() {
  printf "  \033[33m>\033[0m %s\n" "$1"
}

result() {
  printf "  \033[32m✓\033[0m %s\n" "$1"
}

indent() {
  sed 's/^/    /'
}

cleanup() {
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  if [ -f "$DASH_PID_FILE" ]; then
    kill "$(cat "$DASH_PID_FILE")" 2>/dev/null || true
    rm -f "$DASH_PID_FILE"
  fi
  rm -f "$BASE/lattice-demo.db" "$BASE/lattice-demo.db-shm" "$BASE/lattice-demo.db-wal"
  echo ""
  dim "  Servers stopped. Demo database cleaned up."
  echo ""
}
trap cleanup EXIT

# ── Banner ───────────────────────────────────────────────────────────────────

clear
echo ""
printf "  \033[1;36m╔══════════════════════════════════════════════════════════╗\033[0m\n"
printf "  \033[1;36m║\033[0m                                                          \033[1;36m║\033[0m\n"
printf "  \033[1;36m║\033[0m   \033[1mLattice\033[0m — AI Agent Orchestration Control Plane        \033[1;36m║\033[0m\n"
printf "  \033[1;36m║\033[0m   \033[2mConnect your AI agents. Orchestrate everything.\033[0m        \033[1;36m║\033[0m\n"
printf "  \033[1;36m║\033[0m                                                          \033[1;36m║\033[0m\n"
printf "  \033[1;36m╚══════════════════════════════════════════════════════════╝\033[0m\n"
echo ""
dim "  Tech: TypeScript | React | Express | SQLite | React Flow | SSE"
dim "  Protocol: A2A (Agent-to-Agent) by Google"
dim "  218 tests passing | 3 adapters | DAG workflow engine"
echo ""

# ══════════════════════════════════════════════════════════════════════════════
# 1. Boot the system
# ══════════════════════════════════════════════════════════════════════════════

section "1. Starting the System"

# Kill anything lingering on our ports
if lsof -ti :3100 > /dev/null 2>&1; then
  lsof -ti :3100 | xargs kill 2>/dev/null || true
fi
if lsof -ti :3200 > /dev/null 2>&1; then
  lsof -ti :3200 | xargs kill 2>/dev/null || true
fi
sleep 0.5

step "Starting relay server in demo mode (simulated agents)..."
npx tsx packages/relay/src/main.ts --demo > /tmp/lattice-demo-relay.log 2>&1 &
echo $! > "$PID_FILE"
wait_for_relay
result "Relay running at $RELAY"

step "Starting React dashboard..."
npm run dev --workspace=packages/dashboard > /tmp/lattice-demo-dashboard.log 2>&1 &
echo $! > "$DASH_PID_FILE"
sleep 3
result "Dashboard running at $DASH"

if [ "$HEADLESS" = false ]; then
  open "$DASH" 2>/dev/null || true
  dim "  (Browser opened — switch to it to see the dashboard)"
  echo ""
fi

# ══════════════════════════════════════════════════════════════════════════════
# 2. Show registered agents
# ══════════════════════════════════════════════════════════════════════════════

section "2. Agent Registry"

step "Querying registered agents via REST API..."
echo ""
curl -sf "$RELAY/api/agents" | python3 -c "
import sys, json
agents = json.load(sys.stdin)
for a in agents:
    status = a.get('status', 'unknown')
    icon = '\033[32m●\033[0m' if status == 'online' else '\033[31m●\033[0m'
    skills = ', '.join(s['name'] for s in a['card'].get('skills', []))
    print(f'    {icon}  \033[1m{a[\"name\"]:<16}\033[0m {a[\"card\"][\"description\"]}')
    print(f'       Skills: \033[2m{skills}\033[0m')
    print()
"

dim "  Each agent implements the LatticeAdapter interface with"
dim "  skill-based routing, health checks, and streaming support."
echo ""
pause 3

# ══════════════════════════════════════════════════════════════════════════════
# 3. Dispatch a single task — shows routing
# ══════════════════════════════════════════════════════════════════════════════

section "3. Task Dispatch + Intelligent Routing"

step "Dispatching: \"Fix the null pointer bug in auth.ts line 42\""
echo ""

TASK=$(curl -sf -X POST "$RELAY/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{"text": "Fix the null pointer bug in auth.ts line 42", "execute": true}')

printf '%s\n' "$TASK" | python3 -c "
import sys, json
t = json.load(sys.stdin)
status = t['status']
agent = t['metadata']['assignedAgent']
reason = t['metadata']['routingReason']
latency = t['metadata']['latencyMs']
icon = '\033[32m✓\033[0m' if status == 'completed' else '\033[31m✗\033[0m'
print(f'    {icon}  Status: {status}')
print(f'    \033[36m→\033[0m  Routed to: \033[1m{agent}\033[0m')
print(f'    \033[36m→\033[0m  Reason: {reason}')
print(f'    \033[36m→\033[0m  Latency: {latency}ms')
print()
art = t.get('artifacts', [])
if art:
    text = art[0].get('parts', [{}])[0].get('text', '')
    # Show first 3 lines
    lines = text.strip().split('\n')[:3]
    for line in lines:
        print(f'    \033[2m{line}\033[0m')
    if len(text.strip().split('\n')) > 3:
        print(f'    \033[2m... ({len(text.strip().split(chr(10)))} lines total)\033[0m')
"

echo ""
dim "  The learned router uses Thompson Sampling (multi-armed bandit)"
dim "  to match tasks to agents based on skill tags and past performance."
echo ""
pause 3

# ══════════════════════════════════════════════════════════════════════════════
# 4. Dispatch more tasks to build routing stats
# ══════════════════════════════════════════════════════════════════════════════

section "4. Multi-Agent Task Distribution"

TASKS=(
  'Review the PR for the new API endpoints'
  'Send the deploy notification to #engineering'
  'Generate a rate limiter utility function'
  'Schedule a reminder for the standup tomorrow'
)
NAMES=(
  'Code review'
  'Team notification'
  'Code generation'
  'Schedule reminder'
)

for i in "${!TASKS[@]}"; do
  step "Dispatching: \"${NAMES[$i]}\"..."
  R=$(curl -sf -X POST "$RELAY/api/tasks" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"${TASKS[$i]}\", \"execute\": true}")
  AGENT=$(printf '%s\n' "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['metadata']['assignedAgent'])")
  STATUS=$(printf '%s\n' "$R" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
  printf "    \033[32m✓\033[0m  %s → \033[1m%s\033[0m (%s)\n" "${NAMES[$i]}" "$AGENT" "$STATUS"
done

echo ""
result "5 tasks dispatched across 3 agents"
echo ""
pause 3

# ══════════════════════════════════════════════════════════════════════════════
# 5. Show routing stats
# ══════════════════════════════════════════════════════════════════════════════

section "5. Routing Intelligence (Thompson Sampling)"

step "Querying learned routing statistics..."
echo ""

curl -sf "$RELAY/api/routing/stats" | python3 -c "
import sys, json
stats = json.load(sys.stdin)
if not stats:
    print('    (no routing data yet)')
else:
    print('    \033[1m%-16s %-14s %-10s %-12s\033[0m' % ('Agent', 'Category', 'Success', 'Avg Latency'))
    print('    ' + '─' * 54)
    for s in stats:
        agent = s.get('agent_name', '')
        cat = s.get('category', '')
        succ = s.get('successes', 0)
        fail = s.get('failures', 0)
        total = succ + fail
        rate = f'{succ}/{total}' if total > 0 else '—'
        total_lat = s.get('total_latency_ms', 0)
        avg_lat = total_lat / total if total > 0 else 0
        lat_str = f'{avg_lat:.0f}ms' if total > 0 else '—'
        print(f'    %-16s %-14s %-10s %-12s' % (agent, cat, rate, lat_str))
"

echo ""
dim "  The router improves over time — agents that succeed at certain"
dim "  categories earn higher probability of receiving those tasks."
echo ""
pause 3

# ══════════════════════════════════════════════════════════════════════════════
# 6. Run a multi-step workflow (DAG)
# ══════════════════════════════════════════════════════════════════════════════

section "6. Workflow Engine — DAG Execution"

step "Listing available workflows..."
echo ""

WF_LIST=$(curl -sf "$RELAY/api/workflows")
printf '%s\n' "$WF_LIST" | python3 -c "
import sys, json
wfs = json.load(sys.stdin)
for wf in wfs:
    nodes = wf['definition']['nodes']
    edges = wf['definition']['edges']
    agents = set()
    for n in nodes:
        a = n.get('config', {}).get('agent', '')
        if a and a != 'auto': agents.add(a)
    node_labels = ' → '.join(n['label'] for n in nodes)
    print(f'    \033[1m{wf[\"name\"]}\033[0m')
    print(f'    \033[2m{node_labels}\033[0m')
    print(f'    \033[2m{len(nodes)} nodes, {len(edges)} edges, agents: {\", \".join(sorted(agents)) or \"auto\"}\033[0m')
    print()
"

# Find the Code Review workflow (simpler, faster for demo)
WF_ID=$(printf '%s\n' "$WF_LIST" | python3 -c "
import sys, json
wfs = json.load(sys.stdin)
for wf in wfs:
    if 'Code Review' in wf['name']:
        print(wf['id'])
        break
else:
    print(wfs[0]['id'] if wfs else '')
")

step "Running workflow: Code Review..."
dim "    (Claude Code reviews code, OpenClaw sends summary to team)"
echo ""

# Run the workflow
step "Executing..."
RUN=$(curl -sf -X POST "$RELAY/api/workflows/$WF_ID/run")

echo ""
printf '%s\n' "$RUN" | python3 -c "
import sys, json
run = json.load(sys.stdin)
status = run.get('status', 'unknown')
icon = '\033[32m✓\033[0m' if status == 'completed' else '\033[31m✗\033[0m'
print(f'    {icon}  Workflow status: \033[1m{status}\033[0m')
print()
ctx = run.get('context', {})
for node_id, output in ctx.items():
    node_status = output.get('status', '')
    artifacts = output.get('artifacts', [])
    for art in artifacts:
        for part in art.get('parts', []):
            text = part.get('text', '').strip()
            if text:
                preview = text.split(chr(10))[0][:72]
                print(f'    \033[36m⬥\033[0m  \033[1m{node_id}\033[0m ({node_status})')
                print(f'       \033[2m{preview}\033[0m')
                print()
"

echo ""
dim "  Workflows execute as DAGs with topological ordering, parallel"
dim "  branches, conditional nodes, and data mapping between steps."
echo ""
pause 3

# ══════════════════════════════════════════════════════════════════════════════
# 7. Show task history
# ══════════════════════════════════════════════════════════════════════════════

section "7. Task History"

step "Querying all completed tasks..."
echo ""

curl -sf "$RELAY/api/tasks" | python3 -c "
import sys, json
tasks = json.load(sys.stdin)
completed = [t for t in tasks if t['status'] == 'completed']
print(f'    \033[1m{len(completed)} tasks completed\033[0m  (of {len(tasks)} total)')
print()
print('    \033[1m%-14s %-14s %-10s %-8s\033[0m' % ('Task', 'Agent', 'Status', 'Latency'))
print('    ' + '─' * 48)
for t in tasks[:10]:
    # Extract first few words of the task text as a label
    text = t.get('history', [{}])[0].get('parts', [{}])[0].get('text', '')
    label = ' '.join(text.split()[:3])[:12]
    agent = t['metadata']['assignedAgent']
    status = t['status']
    lat = t['metadata']['latencyMs']
    icon = '\033[32m✓\033[0m' if status == 'completed' else '\033[31m✗\033[0m'
    print(f'    {icon} {label:<13} {agent:<14} {status:<10} {lat}ms')
"

echo ""
pause 3

# ══════════════════════════════════════════════════════════════════════════════
# 8. Architecture recap
# ══════════════════════════════════════════════════════════════════════════════

section "8. Architecture"

cat << 'EOF'
    Dashboard (React + Vite)  ◄──── SSE ────►  Relay (Express + SQLite)
                                                       │
                                                       ├── Claude Code adapter
                                                       ├── OpenClaw adapter
                                                       └── Codex adapter

    Key Technical Decisions:

    ✓  A2A Protocol — Google's Agent-to-Agent standard for interop
    ✓  Thompson Sampling — Bayesian multi-armed bandit for routing
    ✓  DAG Workflows — Topological sort, conditions, data mapping
    ✓  SSE Real-Time — Server-Sent Events with replay via Last-Event-ID
    ✓  Pluggable Adapters — TypeScript interface, swap agents freely
    ✓  SQLite + WAL — Zero-config persistence, concurrent reads
    ✓  React Flow — Interactive graph visualization with animations
    ✓  Zustand — Lightweight state management, no boilerplate

EOF

echo ""
printf "  \033[1;36m╔══════════════════════════════════════════════════════════╗\033[0m\n"
printf "  \033[1;36m║\033[0m                                                          \033[1;36m║\033[0m\n"
printf "  \033[1;36m║\033[0m   \033[1m218 tests\033[0m  |  \033[1m12 REST endpoints\033[0m  |  \033[1m11 SSE event types\033[0m   \033[1;36m║\033[0m\n"
printf "  \033[1;36m║\033[0m   \033[1m3 adapters\033[0m |  \033[1mDAG engine\033[0m        |  \033[1mLearned router\033[0m       \033[1;36m║\033[0m\n"
printf "  \033[1;36m║\033[0m                                                          \033[1;36m║\033[0m\n"
printf "  \033[1;36m╚══════════════════════════════════════════════════════════╝\033[0m\n"
echo ""

if [ "$HEADLESS" = false ]; then
  dim "  Dashboard is still running at $DASH — explore it!"
  dim "  Press Enter to shut down the demo servers..."
  read -r
fi
