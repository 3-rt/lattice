#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Lattice Live Demo — boots the system with simulated agents, pre-seeds
# realistic data, and leaves everything running for you to walk through.
#
# Usage:  bash demo-live.sh
# Stop:   Press Ctrl+C
# ─────────────────────────────────────────────────────────────────────────────

BASE="$(cd "$(dirname "$0")" && pwd)"
cd "$BASE"

RELAY="http://localhost:3100"
DASH="http://localhost:3200"
PID_FILE="$BASE/.demo-relay.pid"
DASH_PID_FILE="$BASE/.demo-dashboard.pid"

# ── Colors ───────────────────────────────────────────────────────────────────

green()  { printf "\033[32m%s\033[0m\n"  "$*"; }
yellow() { printf "\033[33m%s\033[0m\n"  "$*"; }
dim()    { printf "\033[2m%s\033[0m\n"   "$*"; }
bold()   { printf "\033[1m%s\033[0m\n"   "$*"; }
cyan()   { printf "\033[1;36m%s\033[0m\n" "$*"; }

# ── Helpers ──────────────────────────────────────────────────────────────────

relay_running() { curl -sf "$RELAY/api/agents" > /dev/null 2>&1; }

wait_for_relay() {
  local i=0
  while ! relay_running; do
    sleep 0.5; i=$((i + 1))
    if [ $i -ge 30 ]; then
      printf "\033[31mRelay did not start in 15s\033[0m\n"
      cat /tmp/lattice-demo-relay.log 2>/dev/null
      exit 1
    fi
  done
}

cleanup() {
  echo ""
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  if [ -f "$DASH_PID_FILE" ]; then
    kill "$(cat "$DASH_PID_FILE")" 2>/dev/null || true
    rm -f "$DASH_PID_FILE"
  fi
  rm -f "$BASE/lattice-demo.db" "$BASE/lattice-demo.db-shm" "$BASE/lattice-demo.db-wal"
  dim "  Demo stopped. Cleaned up."
  echo ""
}
trap cleanup EXIT

# ── Kill anything on our ports ───────────────────────────────────────────────

if lsof -ti :3100 > /dev/null 2>&1; then
  lsof -ti :3100 | xargs kill 2>/dev/null || true
fi
if lsof -ti :3200 > /dev/null 2>&1; then
  lsof -ti :3200 | xargs kill 2>/dev/null || true
fi
sleep 0.5

# ── Start ────────────────────────────────────────────────────────────────────

clear
echo ""
cyan "  Lattice — Live Demo"
echo ""

dim "  Starting relay (demo mode)..."
npx tsx packages/relay/src/main.ts --demo > /tmp/lattice-demo-relay.log 2>&1 &
echo $! > "$PID_FILE"
wait_for_relay
green "  ✓ Relay running at $RELAY"

dim "  Starting dashboard..."
npm run dev --workspace=packages/dashboard > /tmp/lattice-demo-dashboard.log 2>&1 &
echo $! > "$DASH_PID_FILE"
sleep 3
green "  ✓ Dashboard running at $DASH"

# ── Pre-seed: dispatch a few tasks so the dashboard has data ────────────────

dim "  Seeding demo data..."

# Task 1: A completed bug fix (routes to Claude Code)
curl -sf -X POST "$RELAY/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{"text": "Fix the null pointer bug in auth.ts line 42", "execute": true}' > /dev/null

# Task 2: A code review (routes to Claude Code or Codex)
curl -sf -X POST "$RELAY/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{"text": "Review the PR for the new payment service refactor", "execute": true}' > /dev/null

# Task 3: A notification (routes to OpenClaw)
curl -sf -X POST "$RELAY/api/tasks" \
  -H "Content-Type: application/json" \
  -d '{"text": "Send deploy notification to #engineering: v2.4.1 is live", "execute": true}' > /dev/null

green "  ✓ 3 tasks seeded (visible on Tasks page + routing stats)"

echo ""
# ── Open browser ─────────────────────────────────────────────────────────────

open "$DASH" 2>/dev/null || true

# ── Print walkthrough ────────────────────────────────────────────────────────

echo ""
cyan "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
bold "  DEMO WALKTHROUGH"
echo ""
echo "  Use case: \"Incident Response — a production bug triggers a"
echo "  multi-agent pipeline that triages, fixes, reviews, and notifies.\""
echo ""
bold "  1. Agents Page (you're here)"
echo "     Show 3 agents online: Claude Code, OpenClaw, Codex"
echo "     Point out skills, streaming capability, health status"
echo ""
bold "  2. Live Flow"
echo "     Type in the dispatch bar:"
dim "       \"Fix the authentication bug causing 500 errors on /api/login\""
echo "     Watch: task flows from relay → agent → completes"
echo "     Show: edge glow, particle animation, event log on right"
echo ""
bold "  3. Tasks Page"
echo "     Show completed tasks with agent assignments and latency"
echo "     Click a row to expand: see routing reason + output"
echo "     Switch to Routing Stats tab — show success rates by category"
echo ""
bold "  4. Workflows — The Big Moment"
echo "     Switch to Runner tab"
echo "     Select \"Incident Response\" workflow"
echo "     Click Run — watch the 5-step DAG execute:"
echo "       Triage → Fix → Security Review → Review Passed? → Notify"
echo "     Each node lights up as it runs, then turns green"
echo ""
bold "  5. Wrap Up"
echo "     Go back to Tasks — all workflow tasks are visible"
echo "     Check Routing Stats — agents have learned from executions"
echo "     Open the Editor tab — show drag-drop workflow building"
echo ""
cyan "  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
dim "  Dashboard: $DASH"
dim "  Relay API: $RELAY/api/agents"
dim "  Press Ctrl+C to stop"
echo ""

# Keep running until Ctrl+C
wait
