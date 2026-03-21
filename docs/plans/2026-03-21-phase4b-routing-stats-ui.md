# Phase 4b: Task History & Routing Stats UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Task History and Routing Stats views in the dashboard, enabling users to browse task history with expandable details and monitor per-agent routing performance with convergence indicators.
**Architecture:** A new `/tasks` page with two tabs — "History" shows a filterable, expandable task table fed from the Zustand store (real-time via SSE) and initial REST fetch; "Routing Stats" shows a per-agent/category stats table with success rate bars fetched from `GET /api/routing/stats`. Both tabs live under a single `TasksPage` component with local tab state.
**Tech Stack:** React, Zustand, Tailwind CSS, framer-motion, lucide-react, clsx
**Spec:** `docs/specs/2026-03-21-lattice-design.md`

---

## File Structure

```
packages/dashboard/src/
├── lib/
│   └── api.ts                          # + fetchRoutingStats()
├── store/
│   └── lattice-store.ts                # + setTasks action
├── components/
│   ├── layout/
│   │   └── sidebar.tsx                 # Enable Tasks nav item
│   └── tasks/
│       ├── task-dispatch-bar.tsx        # (existing, unchanged)
│       ├── task-table.tsx              # NEW — filterable task table
│       ├── task-row.tsx                # NEW — expandable row
│       ├── task-filters.tsx            # NEW — agent/status filters
│       └── routing-stats-table.tsx     # NEW — stats with success bars
├── pages/
│   └── tasks-page.tsx                  # NEW — page with History/Stats tabs
└── App.tsx                             # + /tasks route
```

---

### Task 1: Add `fetchRoutingStats` to API Client and `setTasks` to Store
**Files:**
- Modify: `packages/dashboard/src/lib/api.ts`
- Modify: `packages/dashboard/src/store/lattice-store.ts`

- [ ] **Step 1: Add RoutingStatsRow interface and fetchRoutingStats to api.ts**

Add the following after the `TaskInfo` interface in `packages/dashboard/src/lib/api.ts`:

```typescript
export interface RoutingStatsRow {
  agent_name: string;
  category: string;
  successes: number;
  failures: number;
  total_latency_ms: number;
  total_cost: number;
  updated_at: string;
}

export async function fetchRoutingStats(): Promise<RoutingStatsRow[]> {
  const res = await fetch(`${BASE_URL}/routing/stats`);
  if (!res.ok) throw new Error(`Failed to fetch routing stats: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Add setTasks action to lattice-store.ts**

Add `setTasks` to the `LatticeState` interface:

```typescript
setTasks: (tasks: TaskInfo[]) => void;
```

Add the implementation in the `create` call:

```typescript
setTasks: (tasks) => set({ tasks }),
```

- [ ] **Step 3: Commit**

```
feat(dashboard): add fetchRoutingStats API and setTasks store action
```

---

### Task 2: Build Task Filters Component
**Files:**
- Create: `packages/dashboard/src/components/tasks/task-filters.tsx`

- [ ] **Step 1: Create task-filters.tsx**

```typescript
import { useLatticeStore } from "../../store/lattice-store.ts";

interface TaskFiltersProps {
  statusFilter: string;
  agentFilter: string;
  onStatusChange: (status: string) => void;
  onAgentChange: (agent: string) => void;
}

const STATUSES = ["", "submitted", "working", "completed", "failed", "canceled", "input-required"];

export function TaskFilters({ statusFilter, agentFilter, onStatusChange, onAgentChange }: TaskFiltersProps) {
  const agents = useLatticeStore((s) => s.agents);

  return (
    <div className="flex gap-2">
      <select
        value={statusFilter}
        onChange={(e) => onStatusChange(e.target.value)}
        className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 focus:border-lattice-600 focus:outline-none"
      >
        <option value="">All statuses</option>
        {STATUSES.filter(Boolean).map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        value={agentFilter}
        onChange={(e) => onAgentChange(e.target.value)}
        className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 focus:border-lattice-600 focus:outline-none"
      >
        <option value="">All agents</option>
        {agents.map((a) => (
          <option key={a.name} value={a.name}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat(dashboard): add task filter controls component
```

---

### Task 3: Build Expandable Task Row Component
**Files:**
- Create: `packages/dashboard/src/components/tasks/task-row.tsx`

- [ ] **Step 1: Create task-row.tsx**

```typescript
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import type { TaskInfo } from "../../lib/api.ts";

interface TaskRowProps {
  task: TaskInfo;
}

const statusColors: Record<string, string> = {
  submitted: "bg-gray-500",
  working: "bg-yellow-400 animate-pulse",
  completed: "bg-emerald-400",
  failed: "bg-red-400",
  canceled: "bg-gray-600",
  "input-required": "bg-amber-400",
};

export function TaskRow({ task }: TaskRowProps) {
  const [expanded, setExpanded] = useState(false);

  const inputText = task.history
    .filter((m) => m.role === "user")
    .flatMap((m) => m.parts.filter((p) => p.type === "text").map((p) => p.text))
    .join("\n");

  const outputText = task.artifacts
    .flatMap((a) => a.parts.filter((p) => p.type === "text").map((p) => p.text))
    .join("\n");

  const latency = task.metadata?.latencyMs;
  const createdAt = task.metadata?.createdAt
    ? new Date(task.metadata.createdAt).toLocaleTimeString()
    : "—";

  return (
    <div className="border-b border-gray-800 last:border-b-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-900/50 transition-colors"
      >
        <ChevronRight
          className={clsx(
            "h-3.5 w-3.5 text-gray-500 transition-transform",
            expanded && "rotate-90"
          )}
        />

        <div className="flex items-center gap-1.5 w-28 shrink-0">
          <div className={clsx("h-2 w-2 rounded-full", statusColors[task.status] ?? "bg-gray-500")} />
          <span className="text-gray-300">{task.status}</span>
        </div>

        <span className="w-36 shrink-0 truncate text-gray-400">
          {task.metadata?.assignedAgent || "—"}
        </span>

        <span className="flex-1 truncate text-gray-400">
          {inputText?.slice(0, 80) || task.id.slice(0, 12)}
        </span>

        <span className="w-20 shrink-0 text-right text-gray-500">
          {latency != null ? `${latency}ms` : "—"}
        </span>

        <span className="w-20 shrink-0 text-right text-gray-600 text-xs">
          {createdAt}
        </span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 space-y-3 ml-8">
              {task.metadata?.routingReason && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Routing Reason</span>
                  <p className="mt-0.5 text-sm text-gray-400">{task.metadata.routingReason}</p>
                </div>
              )}

              {inputText && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Input</span>
                  <pre className="mt-0.5 rounded bg-gray-950 border border-gray-800 p-3 text-xs text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {inputText}
                  </pre>
                </div>
              )}

              {outputText && (
                <div>
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Output</span>
                  <pre className="mt-0.5 rounded bg-gray-950 border border-gray-800 p-3 text-xs text-gray-300 whitespace-pre-wrap max-h-48 overflow-y-auto">
                    {outputText}
                  </pre>
                </div>
              )}

              <div className="flex gap-4 text-xs text-gray-600">
                <span>ID: {task.id}</span>
                {task.metadata?.cost != null && <span>Cost: ${task.metadata.cost.toFixed(4)}</span>}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat(dashboard): add expandable task row component
```

---

### Task 4: Build Task Table Component
**Files:**
- Create: `packages/dashboard/src/components/tasks/task-table.tsx`

- [ ] **Step 1: Create task-table.tsx**

```typescript
import { useEffect, useState } from "react";
import { useLatticeStore } from "../../store/lattice-store.ts";
import { fetchTasks } from "../../lib/api.ts";
import { TaskFilters } from "./task-filters.tsx";
import { TaskRow } from "./task-row.tsx";

export function TaskTable() {
  const tasks = useLatticeStore((s) => s.tasks);
  const setTasks = useLatticeStore((s) => s.setTasks);
  const [statusFilter, setStatusFilter] = useState("");
  const [agentFilter, setAgentFilter] = useState("");

  useEffect(() => {
    fetchTasks().then(setTasks).catch(console.error);
  }, [setTasks]);

  const filtered = tasks.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (agentFilter && t.metadata?.assignedAgent !== agentFilter) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <TaskFilters
        statusFilter={statusFilter}
        agentFilter={agentFilter}
        onStatusChange={setStatusFilter}
        onAgentChange={setAgentFilter}
      />

      <div className="rounded-lg border border-gray-800 bg-gray-900/50">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">
          <span className="w-3.5" /> {/* chevron spacer */}
          <span className="w-28 shrink-0">Status</span>
          <span className="w-36 shrink-0">Agent</span>
          <span className="flex-1">Task</span>
          <span className="w-20 shrink-0 text-right">Latency</span>
          <span className="w-20 shrink-0 text-right">Time</span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <p className="text-sm text-gray-500">No tasks found</p>
            <p className="mt-1 text-xs text-gray-600">
              Dispatch a task from the Agent Overview page to see it here
            </p>
          </div>
        ) : (
          filtered.map((task) => <TaskRow key={task.id} task={task} />)
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat(dashboard): add task history table with filtering
```

---

### Task 5: Build Routing Stats Table Component
**Files:**
- Create: `packages/dashboard/src/components/tasks/routing-stats-table.tsx`

- [ ] **Step 1: Create routing-stats-table.tsx**

```typescript
import { useEffect, useState } from "react";
import { fetchRoutingStats } from "../../lib/api.ts";
import type { RoutingStatsRow } from "../../lib/api.ts";
import { clsx } from "clsx";

export function RoutingStatsTable() {
  const [stats, setStats] = useState<RoutingStatsRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRoutingStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function refresh() {
    setLoading(true);
    fetchRoutingStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  if (loading && stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-12">
        <p className="text-sm text-gray-500">Loading routing stats...</p>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-12">
        <p className="text-sm text-gray-500">No routing stats yet</p>
        <p className="mt-1 text-xs text-gray-600">
          Stats appear after agents complete tasks through the router
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={refresh}
          disabled={loading}
          className="rounded-md border border-gray-700 bg-gray-900 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 transition-colors disabled:opacity-50"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      <div className="rounded-lg border border-gray-800 bg-gray-900/50">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-800 px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">
          <span className="w-36 shrink-0">Agent</span>
          <span className="w-28 shrink-0">Category</span>
          <span className="w-48 shrink-0">Success Rate</span>
          <span className="w-20 shrink-0 text-right">Avg Latency</span>
          <span className="w-20 shrink-0 text-right">Total Cost</span>
          <span className="w-16 shrink-0 text-right">Tasks</span>
        </div>

        {stats.map((row) => {
          const total = row.successes + row.failures;
          const successRate = total > 0 ? (row.successes / total) * 100 : 0;
          const avgLatency = total > 0 ? Math.round(row.total_latency_ms / total) : 0;

          return (
            <div
              key={`${row.agent_name}-${row.category}`}
              className="flex items-center gap-3 border-b border-gray-800 last:border-b-0 px-4 py-3 text-sm"
            >
              <span className="w-36 shrink-0 truncate text-gray-200 font-medium">
                {row.agent_name}
              </span>

              <span className="w-28 shrink-0">
                <span className="rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400">
                  {row.category}
                </span>
              </span>

              <div className="w-48 shrink-0 flex items-center gap-2">
                <div className="flex-1 h-2 rounded-full bg-gray-800 overflow-hidden">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all duration-500",
                      successRate >= 80
                        ? "bg-emerald-500 shadow-sm shadow-emerald-500/30"
                        : successRate >= 50
                          ? "bg-yellow-500"
                          : "bg-red-500"
                    )}
                    style={{ width: `${successRate}%` }}
                  />
                </div>
                <span
                  className={clsx(
                    "text-xs w-12 text-right font-mono",
                    successRate >= 80 ? "text-emerald-400" : successRate >= 50 ? "text-yellow-400" : "text-red-400"
                  )}
                >
                  {successRate.toFixed(0)}%
                </span>
              </div>

              <span className="w-20 shrink-0 text-right text-gray-400">
                {avgLatency > 0 ? `${avgLatency}ms` : "—"}
              </span>

              <span className="w-20 shrink-0 text-right text-gray-400">
                {row.total_cost > 0 ? `$${row.total_cost.toFixed(2)}` : "—"}
              </span>

              <span className="w-16 shrink-0 text-right text-gray-500">
                {total}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat(dashboard): add routing stats table with success rate bars
```

---

### Task 6: Build Tasks Page with Tabs
**Files:**
- Create: `packages/dashboard/src/pages/tasks-page.tsx`

- [ ] **Step 1: Create tasks-page.tsx**

```typescript
import { useState } from "react";
import { clsx } from "clsx";
import { TaskTable } from "../components/tasks/task-table.tsx";
import { RoutingStatsTable } from "../components/tasks/routing-stats-table.tsx";

type Tab = "history" | "stats";

const tabs: { id: Tab; label: string }[] = [
  { id: "history", label: "Task History" },
  { id: "stats", label: "Routing Stats" },
];

export function TasksPage() {
  const [activeTab, setActiveTab] = useState<Tab>("history");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-100">Tasks & Routing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Task history, agent performance, and routing convergence
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-800">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={clsx(
              "px-4 py-2 text-sm font-medium transition-colors -mb-px border-b-2",
              activeTab === tab.id
                ? "border-lattice-500 text-gray-100"
                : "border-transparent text-gray-500 hover:text-gray-300"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "history" ? <TaskTable /> : <RoutingStatsTable />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```
feat(dashboard): add tasks page with history and routing stats tabs
```

---

### Task 7: Wire Up Route and Enable Sidebar Nav
**Files:**
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add /tasks route to App.tsx**

Add the import at the top of `App.tsx`:

```typescript
import { TasksPage } from "./pages/tasks-page.tsx";
```

Replace the comment placeholder with the actual route inside `<Routes>`:

```typescript
<Route path="/tasks" element={<TasksPage />} />
```

The full `App.tsx` should be:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Shell } from "./components/layout/shell.tsx";
import { AgentOverview } from "./pages/agent-overview.tsx";
import { LiveFlow } from "./pages/live-flow.tsx";
import { TasksPage } from "./pages/tasks-page.tsx";

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<AgentOverview />} />
          <Route path="/flow" element={<LiveFlow />} />
          <Route path="/tasks" element={<TasksPage />} />
          {/* Phase 4 routes: /workflows */}
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Enable the Tasks nav item in sidebar.tsx**

In `packages/dashboard/src/components/layout/sidebar.tsx`, remove `disabled: true` from the Tasks nav item. Change:

```typescript
{ to: "/tasks", icon: ListTodo, label: "Tasks", disabled: true },
```

to:

```typescript
{ to: "/tasks", icon: ListTodo, label: "Tasks" },
```

- [ ] **Step 3: Commit**

```
feat(dashboard): wire up /tasks route and enable Tasks nav item
```

---

### Task 8: Verify Build and Manual Smoke Test
**Files:**
- None (verification only)

- [ ] **Step 1: Run TypeScript type check**

```bash
cd packages/dashboard && npx tsc --noEmit
```

Ensure zero errors. Fix any type issues found.

- [ ] **Step 2: Run dev server and verify**

```bash
cd packages/dashboard && npm run dev
```

Manual verification checklist:
- Sidebar "Tasks" link is active (no "Soon" badge)
- Clicking "Tasks" navigates to `/tasks`
- Task History tab shows the task table with column headers
- Clicking a task row expands to show input/output/routing reason
- Filters narrow the displayed tasks
- Routing Stats tab shows per-agent stats with success rate bars
- Color coding: green >= 80%, yellow >= 50%, red < 50%
- Switching tabs preserves filter state on the History tab

- [ ] **Step 3: Commit (if any fixes were needed)**

```
fix(dashboard): address build issues from tasks UI integration
```
