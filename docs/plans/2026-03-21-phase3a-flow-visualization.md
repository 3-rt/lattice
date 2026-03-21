# Phase 3a: Flow Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a live, animated React Flow canvas that visualizes agents as glowing nodes around a central relay hub, with real-time edge animations and message particles driven by SSE events.

**Architecture:** The flow page introduces a React Flow canvas where agents are positioned radially around a central "Relay" node. A dedicated flow store slice manages animation state (active edges, particles, node glow intensities) separately from the core Lattice data store. SSE events flow through the existing `handleSSEEvent` pipeline and additionally drive animation state transitions in the flow store, triggering edge pulses, particle spawns, and node glow changes via Framer Motion and CSS keyframes.

**Tech Stack:** @xyflow/react (React Flow v12), framer-motion (already installed), Tailwind CSS + CSS module for glow keyframes, zustand (already installed), lucide-react (already installed)

**Spec:** `docs/specs/2026-03-21-lattice-design.md` (section: Dashboard & Flow Visualization)

---

## File Structure

```
packages/dashboard/
├── src/
│   ├── App.tsx                                    # MODIFY - add /flow route
│   ├── index.css                                  # MODIFY - add glow/breathing keyframes
│   ├── components/
│   │   ├── layout/
│   │   │   └── sidebar.tsx                        # MODIFY - enable Live Flow nav item
│   │   └── flow/
│   │       ├── flow-canvas.tsx                    # CREATE - React Flow wrapper, layout logic
│   │       ├── relay-node.tsx                     # CREATE - central relay hub node
│   │       ├── agent-node.tsx                     # CREATE - agent node with glow/breathing
│   │       ├── animated-edge.tsx                  # CREATE - neon edge with particle animation
│   │       ├── task-log-panel.tsx                 # CREATE - side panel with live task stream
│   │       └── empty-state.tsx                    # CREATE - shown when no agents registered
│   ├── store/
│   │   └── flow-store.ts                          # CREATE - animation state (particles, glows, active edges)
│   ├── hooks/
│   │   └── use-flow-events.ts                     # CREATE - maps SSE events to flow animations
│   └── pages/
│       └── live-flow.tsx                           # CREATE - page component composing canvas + panel
```

---

### Task 1: Install @xyflow/react and scaffold flow store

**Files:**
- Modify: `packages/dashboard/package.json`
- Create: `packages/dashboard/src/store/flow-store.ts`

- [ ] **Step 1: Install @xyflow/react**

```bash
cd /Users/basilliu/lattice && npm install @xyflow/react --workspace=@lattice/dashboard
```

- [ ] **Step 2: Create the flow animation store**

Create `packages/dashboard/src/store/flow-store.ts`:

```typescript
import { create } from "zustand";

export interface FlowParticle {
  id: string;
  edgeId: string;
  progress: number; // 0 to 1
  taskId: string;
  status: "routing" | "success" | "error";
}

export interface ActiveEdge {
  id: string;
  sourceAgent: string; // "" for relay
  targetAgent: string;
  taskId: string;
  active: boolean;
  status: "routing" | "working" | "success" | "error";
  activatedAt: number;
}

export interface NodeGlow {
  agentName: string;
  intensity: "idle" | "working" | "success" | "error";
  lastUpdated: number;
}

export interface TaskLogEntry {
  id: string;
  timestamp: number;
  type: string;
  taskId: string;
  agentName?: string;
  message: string;
}

interface FlowState {
  particles: FlowParticle[];
  activeEdges: ActiveEdge[];
  nodeGlows: Map<string, NodeGlow>;
  taskLog: TaskLogEntry[];

  // Actions
  activateEdge: (edge: ActiveEdge) => void;
  deactivateEdge: (taskId: string) => void;
  setEdgeStatus: (taskId: string, status: ActiveEdge["status"]) => void;
  addParticle: (particle: FlowParticle) => void;
  removeParticle: (id: string) => void;
  setNodeGlow: (agentName: string, intensity: NodeGlow["intensity"]) => void;
  addLogEntry: (entry: TaskLogEntry) => void;
  clearStaleAnimations: () => void;
}

const MAX_LOG_ENTRIES = 200;
const STALE_EDGE_MS = 10_000;

export const useFlowStore = create<FlowState>((set) => ({
  particles: [],
  activeEdges: [],
  nodeGlows: new Map(),
  taskLog: [],

  activateEdge: (edge) =>
    set((state) => ({
      activeEdges: [
        ...state.activeEdges.filter((e) => e.taskId !== edge.taskId),
        edge,
      ],
    })),

  deactivateEdge: (taskId) =>
    set((state) => ({
      activeEdges: state.activeEdges.filter((e) => e.taskId !== taskId),
    })),

  setEdgeStatus: (taskId, status) =>
    set((state) => ({
      activeEdges: state.activeEdges.map((e) =>
        e.taskId === taskId ? { ...e, status } : e
      ),
    })),

  addParticle: (particle) =>
    set((state) => ({ particles: [...state.particles, particle] })),

  removeParticle: (id) =>
    set((state) => ({
      particles: state.particles.filter((p) => p.id !== id),
    })),

  setNodeGlow: (agentName, intensity) =>
    set((state) => {
      const next = new Map(state.nodeGlows);
      next.set(agentName, { agentName, intensity, lastUpdated: Date.now() });
      return { nodeGlows: next };
    }),

  addLogEntry: (entry) =>
    set((state) => ({
      taskLog: [entry, ...state.taskLog].slice(0, MAX_LOG_ENTRIES),
    })),

  clearStaleAnimations: () =>
    set((state) => {
      const now = Date.now();
      return {
        activeEdges: state.activeEdges.filter(
          (e) => now - e.activatedAt < STALE_EDGE_MS
        ),
      };
    }),
}));
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/package.json packages/dashboard/src/store/flow-store.ts package-lock.json
git commit -m "feat(dashboard): install @xyflow/react and add flow animation store"
```

---

### Task 2: Add glow and breathing CSS keyframes

**Files:**
- Modify: `packages/dashboard/src/index.css`

- [ ] **Step 1: Add keyframes and utility classes to index.css**

Append after the existing `@tailwind utilities;` line in `packages/dashboard/src/index.css`:

```css
@layer utilities {
  /* Agent node idle breathing pulse */
  @keyframes breathe {
    0%, 100% {
      box-shadow: 0 0 8px 2px rgba(76, 110, 245, 0.15);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 0 16px 4px rgba(76, 110, 245, 0.3);
      transform: scale(1.02);
    }
  }

  /* Intensified working glow */
  @keyframes glow-working {
    0%, 100% {
      box-shadow: 0 0 12px 4px rgba(76, 110, 245, 0.4);
    }
    50% {
      box-shadow: 0 0 24px 8px rgba(76, 110, 245, 0.7);
    }
  }

  /* Success flash */
  @keyframes glow-success {
    0% {
      box-shadow: 0 0 20px 8px rgba(52, 211, 153, 0.8);
    }
    100% {
      box-shadow: 0 0 8px 2px rgba(52, 211, 153, 0.1);
    }
  }

  /* Error flash */
  @keyframes glow-error {
    0% {
      box-shadow: 0 0 20px 8px rgba(248, 113, 113, 0.8);
    }
    100% {
      box-shadow: 0 0 8px 2px rgba(248, 113, 113, 0.1);
    }
  }

  /* Neon edge pulse */
  @keyframes edge-pulse {
    0%, 100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }

  /* Particle travel along edge */
  @keyframes particle-travel {
    0% {
      offset-distance: 0%;
      opacity: 0;
    }
    10% {
      opacity: 1;
    }
    90% {
      opacity: 1;
    }
    100% {
      offset-distance: 100%;
      opacity: 0;
    }
  }

  .animate-breathe {
    animation: breathe 3s ease-in-out infinite;
  }

  .animate-glow-working {
    animation: glow-working 1.5s ease-in-out infinite;
  }

  .animate-glow-success {
    animation: glow-success 1s ease-out forwards;
  }

  .animate-glow-error {
    animation: glow-error 1s ease-out forwards;
  }

  .animate-edge-pulse {
    animation: edge-pulse 1.5s ease-in-out infinite;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/index.css
git commit -m "feat(dashboard): add glow, breathing, and edge animation keyframes"
```

---

### Task 3: Build the relay hub node and agent node components

**Files:**
- Create: `packages/dashboard/src/components/flow/relay-node.tsx`
- Create: `packages/dashboard/src/components/flow/agent-node.tsx`

- [ ] **Step 1: Create the relay hub node**

Create `packages/dashboard/src/components/flow/relay-node.tsx`:

```typescript
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";

export interface RelayNodeData {
  label: string;
  taskCount: number;
}

export const RelayNode = memo(function RelayNode({
  data,
}: NodeProps & { data: RelayNodeData }) {
  return (
    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-lattice-500 bg-gray-900 shadow-lg shadow-lattice-900/40">
      <div className="absolute inset-0 rounded-full animate-breathe" />
      <div className="flex flex-col items-center gap-0.5 z-10">
        <Zap className="h-5 w-5 text-lattice-400" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-lattice-300">
          {data.label}
        </span>
      </div>
      {data.taskCount > 0 && (
        <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-lattice-600 text-[9px] font-bold text-white shadow">
          {data.taskCount}
        </div>
      )}
      {/* Invisible handles around the circle for edge connections */}
      <Handle type="source" position={Position.Top} className="!bg-transparent !border-none !w-0 !h-0" id="top" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-none !w-0 !h-0" id="bottom" />
      <Handle type="source" position={Position.Left} className="!bg-transparent !border-none !w-0 !h-0" id="left" />
      <Handle type="source" position={Position.Right} className="!bg-transparent !border-none !w-0 !h-0" id="right" />
    </div>
  );
});
```

- [ ] **Step 2: Create the agent node**

Create `packages/dashboard/src/components/flow/agent-node.tsx`:

```typescript
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { clsx } from "clsx";
import { Bot } from "lucide-react";
import { useFlowStore } from "../../store/flow-store.ts";

export interface AgentNodeData {
  agentName: string;
  description: string;
  status: string;
  skills: string[];
}

export const AgentNode = memo(function AgentNode({
  data,
}: NodeProps & { data: AgentNodeData }) {
  const glow = useFlowStore((s) => s.nodeGlows.get(data.agentName));
  const isOnline = data.status === "online";
  const intensity = glow?.intensity ?? "idle";

  return (
    <div
      className={clsx(
        "relative w-44 rounded-lg border bg-gray-900 p-3 transition-all duration-300",
        !isOnline && "opacity-40 border-gray-800",
        isOnline && intensity === "idle" && "border-gray-700 animate-breathe",
        isOnline && intensity === "working" && "border-lattice-500 animate-glow-working",
        isOnline && intensity === "success" && "border-emerald-400 animate-glow-success",
        isOnline && intensity === "error" && "border-red-400 animate-glow-error"
      )}
    >
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-lattice-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-100 truncate">
          {data.agentName}
        </span>
        <div
          className={clsx(
            "ml-auto h-2 w-2 rounded-full shrink-0",
            isOnline ? "bg-emerald-400" : "bg-gray-600"
          )}
        />
      </div>

      <p className="mt-1 text-[10px] text-gray-500 line-clamp-1">
        {data.description}
      </p>

      {data.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="rounded bg-gray-800 px-1.5 py-0.5 text-[9px] text-gray-400"
            >
              {skill}
            </span>
          ))}
          {data.skills.length > 3 && (
            <span className="text-[9px] text-gray-600">
              +{data.skills.length - 3}
            </span>
          )}
        </div>
      )}

      <Handle type="target" position={Position.Top} className="!bg-transparent !border-none !w-0 !h-0" id="top" />
      <Handle type="target" position={Position.Bottom} className="!bg-transparent !border-none !w-0 !h-0" id="bottom" />
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-none !w-0 !h-0" id="left" />
      <Handle type="target" position={Position.Right} className="!bg-transparent !border-none !w-0 !h-0" id="right" />
    </div>
  );
});
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/flow/relay-node.tsx packages/dashboard/src/components/flow/agent-node.tsx
git commit -m "feat(dashboard): add relay hub and agent node components for flow canvas"
```

---

### Task 4: Build the animated edge with neon glow and message particles

**Files:**
- Create: `packages/dashboard/src/components/flow/animated-edge.tsx`

- [ ] **Step 1: Create the animated edge component**

Create `packages/dashboard/src/components/flow/animated-edge.tsx`:

```typescript
import { memo } from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { useFlowStore } from "../../store/flow-store.ts";

export interface AnimatedEdgeData {
  taskId?: string;
}

export const AnimatedEdge = memo(function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps & { data?: AnimatedEdgeData }) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const activeEdge = useFlowStore((s) =>
    s.activeEdges.find((e) => e.id === id)
  );
  const isActive = activeEdge?.active ?? false;
  const status = activeEdge?.status ?? "routing";

  const colorMap = {
    routing: { stroke: "#4c6ef5", glow: "rgba(76, 110, 245, 0.6)" },
    working: { stroke: "#4c6ef5", glow: "rgba(76, 110, 245, 0.8)" },
    success: { stroke: "#34d399", glow: "rgba(52, 211, 153, 0.6)" },
    error: { stroke: "#f87171", glow: "rgba(248, 113, 113, 0.6)" },
  };

  const colors = colorMap[status];

  return (
    <>
      {/* Base dim edge (always visible) */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: "rgba(75, 85, 99, 0.3)",
          strokeWidth: 1.5,
        }}
      />

      {isActive && (
        <>
          {/* Glow layer behind the main stroke */}
          <path
            d={edgePath}
            fill="none"
            stroke={colors.glow}
            strokeWidth={8}
            strokeLinecap="round"
            className="animate-edge-pulse"
            style={{ filter: `blur(4px)` }}
          />

          {/* Main active stroke */}
          <path
            d={edgePath}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={2.5}
            strokeLinecap="round"
            className="animate-edge-pulse"
          />

          {/* Traveling particle */}
          <circle r="4" fill={colors.stroke} className="flow-particle">
            <animateMotion
              dur="1.2s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>

          {/* Particle glow trail */}
          <circle r="8" fill={colors.glow} opacity="0.4">
            <animateMotion
              dur="1.2s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
        </>
      )}
    </>
  );
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/flow/animated-edge.tsx
git commit -m "feat(dashboard): add animated edge with neon glow and message particles"
```

---

### Task 5: Create the flow event hook that maps SSE events to animations

**Files:**
- Create: `packages/dashboard/src/hooks/use-flow-events.ts`

- [ ] **Step 1: Create the flow events hook**

Create `packages/dashboard/src/hooks/use-flow-events.ts`:

```typescript
import { useEffect, useRef } from "react";
import { useLatticeStore } from "../store/lattice-store.ts";
import { useFlowStore, type TaskLogEntry } from "../store/flow-store.ts";

/**
 * Subscribes to the Lattice store and drives flow animation state.
 * Must be mounted inside the flow page.
 */
export function useFlowEvents() {
  const tasks = useLatticeStore((s) => s.tasks);
  const agents = useLatticeStore((s) => s.agents);

  const activateEdge = useFlowStore((s) => s.activateEdge);
  const deactivateEdge = useFlowStore((s) => s.deactivateEdge);
  const setEdgeStatus = useFlowStore((s) => s.setEdgeStatus);
  const setNodeGlow = useFlowStore((s) => s.setNodeGlow);
  const addLogEntry = useFlowStore((s) => s.addLogEntry);
  const clearStaleAnimations = useFlowStore((s) => s.clearStaleAnimations);

  const prevTasksRef = useRef<typeof tasks>([]);
  const logIdCounter = useRef(0);

  // Garbage-collect stale edges every 5 seconds
  useEffect(() => {
    const interval = setInterval(clearStaleAnimations, 5000);
    return () => clearInterval(interval);
  }, [clearStaleAnimations]);

  // Diff tasks to detect state transitions
  useEffect(() => {
    const prev = prevTasksRef.current;
    const prevMap = new Map(prev.map((t) => [t.id, t]));

    for (const task of tasks) {
      const old = prevMap.get(task.id);
      const oldStatus = old?.status;
      const newStatus = task.status;

      if (oldStatus === newStatus) continue;

      const agentName = task.metadata?.assignedAgent ?? "";
      const edgeId = agentName ? `relay-${agentName}` : "";

      function log(type: string, message: string) {
        logIdCounter.current += 1;
        const entry: TaskLogEntry = {
          id: `log-${logIdCounter.current}`,
          timestamp: Date.now(),
          type,
          taskId: task.id,
          agentName: agentName || undefined,
          message,
        };
        addLogEntry(entry);
      }

      // New task created
      if (!old && newStatus) {
        log("task:created", `Task created: "${truncate(taskText(task), 60)}"`);
        setNodeGlow("__relay__", "working");
        // Reset relay glow after brief highlight
        setTimeout(() => setNodeGlow("__relay__", "idle"), 2000);
      }

      // Task routed to agent
      if (newStatus === "working" && oldStatus !== "working" && agentName) {
        log(
          "task:routed",
          `Routed to ${agentName}${task.metadata?.routingReason ? ` (${task.metadata.routingReason})` : ""}`
        );
        activateEdge({
          id: edgeId,
          sourceAgent: "",
          targetAgent: agentName,
          taskId: task.id,
          active: true,
          status: "working",
          activatedAt: Date.now(),
        });
        setNodeGlow(agentName, "working");
      }

      // Task completed
      if (newStatus === "completed" && oldStatus !== "completed") {
        log("task:completed", `Completed by ${agentName || "unknown"}`);
        if (agentName) {
          setEdgeStatus(task.id, "success");
          setNodeGlow(agentName, "success");
          // Fade out after 3 seconds
          setTimeout(() => {
            deactivateEdge(task.id);
            setNodeGlow(agentName, "idle");
          }, 3000);
        }
      }

      // Task failed
      if (newStatus === "failed" && oldStatus !== "failed") {
        log("task:failed", `Failed${agentName ? ` on ${agentName}` : ""}`);
        if (agentName) {
          setEdgeStatus(task.id, "error");
          setNodeGlow(agentName, "error");
          setTimeout(() => {
            deactivateEdge(task.id);
            setNodeGlow(agentName, "idle");
          }, 3000);
        }
      }

      // Task canceled
      if (newStatus === "canceled" && oldStatus !== "canceled") {
        log("task:canceled", `Canceled`);
        deactivateEdge(task.id);
        if (agentName) setNodeGlow(agentName, "idle");
      }
    }

    prevTasksRef.current = tasks;
  }, [
    tasks,
    activateEdge,
    deactivateEdge,
    setEdgeStatus,
    setNodeGlow,
    addLogEntry,
  ]);

  return { agents, tasks };
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "\u2026" : str;
}

function taskText(task: { history?: Array<{ parts: Array<{ text?: string }> }> }): string {
  const firstMsg = task.history?.[0]?.parts?.[0]?.text;
  return firstMsg ?? "(no message)";
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/hooks/use-flow-events.ts
git commit -m "feat(dashboard): add useFlowEvents hook mapping SSE events to flow animations"
```

---

### Task 6: Build the task log side panel

**Files:**
- Create: `packages/dashboard/src/components/flow/task-log-panel.tsx`

- [ ] **Step 1: Create the task log panel component**

Create `packages/dashboard/src/components/flow/task-log-panel.tsx`:

```typescript
import { useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { ScrollText } from "lucide-react";
import { useFlowStore, type TaskLogEntry } from "../../store/flow-store.ts";

export function TaskLogPanel() {
  const taskLog = useFlowStore((s) => s.taskLog);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to top when new entries arrive (newest-first list)
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [taskLog.length]);

  return (
    <div className="flex h-full w-72 flex-col border-l border-gray-800 bg-gray-950">
      <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
        <ScrollText className="h-4 w-4 text-gray-400" />
        <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">
          Live Task Log
        </span>
        <span className="ml-auto text-[10px] text-gray-600">
          {taskLog.length} events
        </span>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {taskLog.length === 0 && (
          <p className="mt-8 text-center text-xs text-gray-600">
            No events yet. Dispatch a task to see live activity.
          </p>
        )}

        <AnimatePresence initial={false}>
          {taskLog.map((entry) => (
            <LogEntry key={entry.id} entry={entry} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function LogEntry({ entry }: { entry: TaskLogEntry }) {
  const typeColor = {
    "task:created": "text-lattice-400",
    "task:routed": "text-blue-400",
    "task:completed": "text-emerald-400",
    "task:failed": "text-red-400",
    "task:canceled": "text-yellow-400",
  }[entry.type] ?? "text-gray-400";

  const dotColor = {
    "task:created": "bg-lattice-400",
    "task:routed": "bg-blue-400",
    "task:completed": "bg-emerald-400",
    "task:failed": "bg-red-400",
    "task:canceled": "bg-yellow-400",
  }[entry.type] ?? "bg-gray-600";

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="flex gap-2 rounded px-2 py-1.5 hover:bg-gray-900"
    >
      <div className={clsx("mt-1.5 h-1.5 w-1.5 rounded-full shrink-0", dotColor)} />
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className={clsx("text-[10px] font-medium", typeColor)}>
            {entry.type.split(":")[1]}
          </span>
          <span className="text-[9px] text-gray-700">
            {formatTime(entry.timestamp)}
          </span>
        </div>
        <p className="text-[10px] text-gray-500 leading-tight truncate">
          {entry.message}
        </p>
        <span className="text-[9px] text-gray-700 font-mono">
          {entry.taskId.slice(0, 8)}
        </span>
      </div>
    </motion.div>
  );
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/flow/task-log-panel.tsx
git commit -m "feat(dashboard): add live task log side panel for flow view"
```

---

### Task 7: Build the empty state and flow canvas with radial layout

**Files:**
- Create: `packages/dashboard/src/components/flow/empty-state.tsx`
- Create: `packages/dashboard/src/components/flow/flow-canvas.tsx`

- [ ] **Step 1: Create the empty state component**

Create `packages/dashboard/src/components/flow/empty-state.tsx`:

```typescript
import { Unplug } from "lucide-react";

export function FlowEmptyState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <div className="rounded-full border border-gray-800 bg-gray-900 p-4">
        <Unplug className="h-8 w-8 text-gray-600" />
      </div>
      <h2 className="text-sm font-semibold text-gray-400">
        No agents connected
      </h2>
      <p className="max-w-xs text-xs text-gray-600">
        Register adapters in <code className="text-gray-500">lattice.config.json</code>{" "}
        and start the relay to see agents appear on the flow canvas.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create the flow canvas with radial layout**

Create `packages/dashboard/src/components/flow/flow-canvas.tsx`:

```typescript
import { useMemo, useCallback } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  useNodesState,
  useEdgesState,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useLatticeStore } from "../../store/lattice-store.ts";
import { useFlowStore } from "../../store/flow-store.ts";
import { RelayNode, type RelayNodeData } from "./relay-node.tsx";
import { AgentNode, type AgentNodeData } from "./agent-node.tsx";
import { AnimatedEdge } from "./animated-edge.tsx";
import { FlowEmptyState } from "./empty-state.tsx";

const nodeTypes = {
  relay: RelayNode,
  agent: AgentNode,
};

const edgeTypes = {
  animated: AnimatedEdge,
};

const RADIUS = 250;
const CENTER_X = 0;
const CENTER_Y = 0;

/**
 * Compute radial positions for N agents around a center point.
 * Start from the top (-PI/2) and distribute evenly.
 */
function radialLayout(count: number): Array<{ x: number; y: number }> {
  if (count === 0) return [];
  const startAngle = -Math.PI / 2;
  const step = (2 * Math.PI) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: CENTER_X + RADIUS * Math.cos(startAngle + i * step),
    y: CENTER_Y + RADIUS * Math.sin(startAngle + i * step),
  }));
}

/**
 * Pick the best handle pair for an edge based on agent position relative to relay.
 */
function pickHandles(agentX: number, agentY: number): { source: string; target: string } {
  const angle = Math.atan2(agentY - CENTER_Y, agentX - CENTER_X);
  const deg = (angle * 180) / Math.PI;

  if (deg >= -45 && deg < 45) return { source: "right", target: "left" };
  if (deg >= 45 && deg < 135) return { source: "bottom", target: "top" };
  if (deg >= -135 && deg < -45) return { source: "top", target: "bottom" };
  return { source: "left", target: "right" };
}

export function FlowCanvas() {
  const agents = useLatticeStore((s) => s.agents);
  const tasks = useLatticeStore((s) => s.tasks);
  const activeEdges = useFlowStore((s) => s.activeEdges);

  const activeTasks = tasks.filter(
    (t) => t.status === "working" || t.status === "submitted"
  );

  const { nodes, edges } = useMemo(() => {
    if (agents.length === 0) return { nodes: [], edges: [] };

    const positions = radialLayout(agents.length);

    const relayNode: Node = {
      id: "relay",
      type: "relay",
      position: { x: CENTER_X - 40, y: CENTER_Y - 40 }, // offset for node center
      data: {
        label: "Relay",
        taskCount: activeTasks.length,
      } satisfies RelayNodeData,
      draggable: false,
      selectable: false,
    };

    const agentNodes: Node[] = agents.map((agent, i) => ({
      id: `agent-${agent.name}`,
      type: "agent",
      position: { x: positions[i].x - 88, y: positions[i].y - 40 }, // offset for node center (w-44/2, estimated h/2)
      data: {
        agentName: agent.name,
        description: agent.card.description,
        status: agent.status,
        skills: agent.card.skills.map((s) => s.name),
      } satisfies AgentNodeData,
      draggable: true,
      selectable: false,
    }));

    const edgeList: Edge[] = agents.map((agent, i) => {
      const handles = pickHandles(positions[i].x, positions[i].y);
      return {
        id: `relay-${agent.name}`,
        source: "relay",
        target: `agent-${agent.name}`,
        sourceHandle: handles.source,
        targetHandle: handles.target,
        type: "animated",
        data: {},
      };
    });

    return { nodes: [relayNode, ...agentNodes], edges: edgeList };
  }, [agents, activeTasks.length]);

  if (agents.length === 0) {
    return <FlowEmptyState />;
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(75, 85, 99, 0.15)"
        />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/flow/empty-state.tsx packages/dashboard/src/components/flow/flow-canvas.tsx
git commit -m "feat(dashboard): add flow canvas with radial agent layout and empty state"
```

---

### Task 8: Create the Live Flow page and wire up routing

**Files:**
- Create: `packages/dashboard/src/pages/live-flow.tsx`
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Create the live flow page**

Create `packages/dashboard/src/pages/live-flow.tsx`:

```typescript
import { useEffect } from "react";
import { useLatticeStore } from "../store/lattice-store.ts";
import { useFlowEvents } from "../hooks/use-flow-events.ts";
import { FlowCanvas } from "../components/flow/flow-canvas.tsx";
import { TaskLogPanel } from "../components/flow/task-log-panel.tsx";
import { TaskDispatchBar } from "../components/tasks/task-dispatch-bar.tsx";
import { fetchAgents, fetchTasks } from "../lib/api.ts";

export function LiveFlow() {
  const setAgents = useLatticeStore((s) => s.setAgents);

  // Load initial data
  useEffect(() => {
    fetchAgents()
      .then((agents) => setAgents(agents))
      .catch((err) => console.error("Failed to fetch agents:", err));
    fetchTasks()
      .then(() => {}) // tasks are added via SSE
      .catch((err) => console.error("Failed to fetch tasks:", err));
  }, [setAgents]);

  // Activate flow event processing
  useFlowEvents();

  return (
    <div className="flex h-full flex-col">
      {/* Top bar with dispatch */}
      <div className="shrink-0 border-b border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-sm font-semibold text-gray-100">Live Flow</h1>
            <p className="text-[10px] text-gray-500">
              Real-time agent orchestration view
            </p>
          </div>
          <div className="flex-1 max-w-xl">
            <TaskDispatchBar />
          </div>
        </div>
      </div>

      {/* Canvas + side panel */}
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          <FlowCanvas />
        </div>
        <TaskLogPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add the /flow route to App.tsx**

Update `packages/dashboard/src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Shell } from "./components/layout/shell.tsx";
import { AgentOverview } from "./pages/agent-overview.tsx";
import { LiveFlow } from "./pages/live-flow.tsx";

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<AgentOverview />} />
          <Route path="/flow" element={<LiveFlow />} />
          {/* Phase 3/4 routes: /tasks, /workflows */}
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
```

- [ ] **Step 3: Enable Live Flow in sidebar navigation**

In `packages/dashboard/src/components/layout/sidebar.tsx`, change the navItems array to remove `disabled: true` from the Live Flow entry:

```typescript
const navItems = [
  { to: "/", icon: Layout, label: "Agents" },
  { to: "/flow", icon: Activity, label: "Live Flow" },
  { to: "/tasks", icon: ListTodo, label: "Tasks", disabled: true },
  { to: "/workflows", icon: GitBranch, label: "Workflows", disabled: true },
];
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/pages/live-flow.tsx packages/dashboard/src/App.tsx packages/dashboard/src/components/layout/sidebar.tsx
git commit -m "feat(dashboard): wire up Live Flow page with routing and enable sidebar nav"
```

---

### Task 9: Add flow store unit tests

**Files:**
- Create: `packages/dashboard/src/store/flow-store.test.ts`

- [ ] **Step 1: Create flow store tests**

Create `packages/dashboard/src/store/flow-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useFlowStore } from "./flow-store.ts";

describe("FlowStore", () => {
  beforeEach(() => {
    // Reset store between tests
    useFlowStore.setState({
      particles: [],
      activeEdges: [],
      nodeGlows: new Map(),
      taskLog: [],
    });
  });

  describe("activateEdge", () => {
    it("adds a new active edge", () => {
      useFlowStore.getState().activateEdge({
        id: "relay-agent1",
        sourceAgent: "",
        targetAgent: "agent1",
        taskId: "task-1",
        active: true,
        status: "routing",
        activatedAt: Date.now(),
      });

      const edges = useFlowStore.getState().activeEdges;
      expect(edges).toHaveLength(1);
      expect(edges[0].targetAgent).toBe("agent1");
    });

    it("replaces edge with same taskId", () => {
      const store = useFlowStore.getState();
      store.activateEdge({
        id: "relay-agent1",
        sourceAgent: "",
        targetAgent: "agent1",
        taskId: "task-1",
        active: true,
        status: "routing",
        activatedAt: Date.now(),
      });
      store.activateEdge({
        id: "relay-agent1",
        sourceAgent: "",
        targetAgent: "agent1",
        taskId: "task-1",
        active: true,
        status: "working",
        activatedAt: Date.now(),
      });

      const edges = useFlowStore.getState().activeEdges;
      expect(edges).toHaveLength(1);
      expect(edges[0].status).toBe("working");
    });
  });

  describe("deactivateEdge", () => {
    it("removes edge by taskId", () => {
      useFlowStore.getState().activateEdge({
        id: "relay-agent1",
        sourceAgent: "",
        targetAgent: "agent1",
        taskId: "task-1",
        active: true,
        status: "working",
        activatedAt: Date.now(),
      });

      useFlowStore.getState().deactivateEdge("task-1");
      expect(useFlowStore.getState().activeEdges).toHaveLength(0);
    });
  });

  describe("setEdgeStatus", () => {
    it("updates status of edge by taskId", () => {
      useFlowStore.getState().activateEdge({
        id: "relay-agent1",
        sourceAgent: "",
        targetAgent: "agent1",
        taskId: "task-1",
        active: true,
        status: "routing",
        activatedAt: Date.now(),
      });

      useFlowStore.getState().setEdgeStatus("task-1", "success");
      expect(useFlowStore.getState().activeEdges[0].status).toBe("success");
    });
  });

  describe("setNodeGlow", () => {
    it("sets glow intensity for an agent", () => {
      useFlowStore.getState().setNodeGlow("agent1", "working");

      const glow = useFlowStore.getState().nodeGlows.get("agent1");
      expect(glow).toBeDefined();
      expect(glow!.intensity).toBe("working");
    });

    it("overwrites previous glow state", () => {
      const store = useFlowStore.getState();
      store.setNodeGlow("agent1", "working");
      store.setNodeGlow("agent1", "success");

      const glow = useFlowStore.getState().nodeGlows.get("agent1");
      expect(glow!.intensity).toBe("success");
    });
  });

  describe("addLogEntry", () => {
    it("prepends new entries (newest first)", () => {
      const store = useFlowStore.getState();
      store.addLogEntry({
        id: "log-1",
        timestamp: 1000,
        type: "task:created",
        taskId: "t1",
        message: "First",
      });
      store.addLogEntry({
        id: "log-2",
        timestamp: 2000,
        type: "task:routed",
        taskId: "t1",
        agentName: "agent1",
        message: "Second",
      });

      const log = useFlowStore.getState().taskLog;
      expect(log).toHaveLength(2);
      expect(log[0].id).toBe("log-2");
      expect(log[1].id).toBe("log-1");
    });

    it("caps at 200 entries", () => {
      const store = useFlowStore.getState();
      for (let i = 0; i < 210; i++) {
        store.addLogEntry({
          id: `log-${i}`,
          timestamp: i,
          type: "task:created",
          taskId: `t-${i}`,
          message: `Entry ${i}`,
        });
      }

      expect(useFlowStore.getState().taskLog).toHaveLength(200);
    });
  });

  describe("clearStaleAnimations", () => {
    it("removes edges older than 10 seconds", () => {
      useFlowStore.getState().activateEdge({
        id: "relay-agent1",
        sourceAgent: "",
        targetAgent: "agent1",
        taskId: "task-1",
        active: true,
        status: "working",
        activatedAt: Date.now() - 15_000, // 15 seconds ago
      });
      useFlowStore.getState().activateEdge({
        id: "relay-agent2",
        sourceAgent: "",
        targetAgent: "agent2",
        taskId: "task-2",
        active: true,
        status: "working",
        activatedAt: Date.now(), // just now
      });

      useFlowStore.getState().clearStaleAnimations();

      const edges = useFlowStore.getState().activeEdges;
      expect(edges).toHaveLength(1);
      expect(edges[0].taskId).toBe("task-2");
    });
  });

  describe("particles", () => {
    it("adds and removes particles", () => {
      const store = useFlowStore.getState();
      store.addParticle({
        id: "p1",
        edgeId: "relay-agent1",
        progress: 0,
        taskId: "task-1",
        status: "routing",
      });

      expect(useFlowStore.getState().particles).toHaveLength(1);

      store.removeParticle("p1");
      expect(useFlowStore.getState().particles).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
cd /Users/basilliu/lattice && npx vitest run packages/dashboard/src/store/flow-store.test.ts
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/store/flow-store.test.ts
git commit -m "test(dashboard): add flow store unit tests"
```

---

### Task 10: Manual smoke test and final polish

**Files:**
- No new files. This task verifies the full integration.

- [ ] **Step 1: Verify full TypeScript compilation**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Run all dashboard tests**

```bash
cd /Users/basilliu/lattice && npx vitest run
```

Expected: all existing tests pass, plus the new flow store tests.

- [ ] **Step 3: Start the dev server and verify visually**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npm run dev
```

Manual verification checklist:
- Navigate to http://localhost:3200/flow
- With no agents: empty state shows with plug icon and config instructions
- Sidebar "Live Flow" link is active (no longer grayed out with "Soon")
- Task dispatch bar is visible at top of flow page
- Task log panel is visible on the right side

If the relay is running on port 3100 with registered agents:
- Agents appear as nodes radially positioned around the central relay hub
- Agent nodes show name, status dot, description, and skill tags
- Idle online agents have a subtle breathing animation
- Dispatching a task triggers: relay node highlight, edge activation with neon glow, particle animation, agent node glow intensification
- Completed tasks flash green on the agent node and edge, then fade
- Failed tasks flash red
- Task log panel updates in real time with each event

- [ ] **Step 4: Verify no React Flow CSS conflicts**

Ensure `@xyflow/react/dist/style.css` is imported in `flow-canvas.tsx` (already done in Task 7). Verify the dark background of the canvas blends with the dashboard theme (React Flow's default bg is transparent, our `Background` component uses dark dots).

If the React Flow default panel controls (zoom buttons) feel out of place, they can be hidden by adding to the `ReactFlow` component:

```tsx
<ReactFlow ... >
  {/* Background only, no Controls or MiniMap for clean look */}
  <Background ... />
</ReactFlow>
```

This is already the case in our implementation.
