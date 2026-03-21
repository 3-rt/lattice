# Phase 2d: Dashboard Shell + Agent Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React dashboard shell with sidebar navigation, SSE real-time connection, Zustand state store, agent cards grid, and task dispatch bar — providing the live agent overview as the home page.

**Architecture:** Vite + React SPA running on port 3200. Connects to the relay at port 3100 via SSE for real-time updates and REST for actions. Zustand manages global state (agents, tasks, connection status). The shell provides the layout and nav for future views (Live Flow, Task History, Workflows) added in Phase 3/4.

**Tech Stack:** React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui, Zustand, Framer Motion

**Spec:** `docs/specs/2026-03-21-lattice-design.md` (section: Dashboard & Flow Visualization)

---

## File Structure

```
packages/dashboard/
├── src/
│   ├── main.tsx                      # React entrypoint
│   ├── App.tsx                       # Root component with router
│   ├── hooks/
│   │   └── use-sse.ts                # SSE connection hook
│   ├── store/
│   │   └── lattice-store.ts          # Zustand store (agents, tasks, connection)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── sidebar.tsx           # Sidebar navigation
│   │   │   └── shell.tsx             # App shell (sidebar + content area)
│   │   ├── agents/
│   │   │   ├── agent-card.tsx        # Single agent card
│   │   │   └── agent-grid.tsx        # Agent cards grid
│   │   └── tasks/
│   │       └── task-dispatch-bar.tsx  # Task input + agent selector + send
│   ├── pages/
│   │   └── agent-overview.tsx        # Home page: dispatch bar + agent grid
│   └── lib/
│       └── api.ts                    # Relay REST API client
├── index.html
├── postcss.config.js
├── tailwind.config.js
├── vite.config.ts
├── package.json
└── tsconfig.json
```

---

### Task 1: Vite + React + Tailwind Scaffold

**Files:**
- Create: `packages/dashboard/package.json`
- Create: `packages/dashboard/tsconfig.json`
- Create: `packages/dashboard/vite.config.ts`
- Create: `packages/dashboard/tailwind.config.js`
- Create: `packages/dashboard/postcss.config.js`
- Create: `packages/dashboard/index.html`
- Create: `packages/dashboard/src/main.tsx`
- Create: `packages/dashboard/src/App.tsx`
- Create: `packages/dashboard/src/index.css`

- [ ] **Step 1: Create package.json**

```json
// packages/dashboard/package.json
{
  "name": "@lattice/dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --port 3200",
    "build": "tsc && vite build",
    "preview": "vite preview --port 3200"
  },
  "dependencies": {
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "react-router-dom": "^7.0.0",
    "zustand": "^5.0.0",
    "framer-motion": "^11.0.0",
    "lucide-react": "^0.400.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.5.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
// packages/dashboard/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
// packages/dashboard/vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3200,
    proxy: {
      "/api": {
        target: "http://localhost:3100",
        changeOrigin: true,
      },
    },
  },
});
```

- [ ] **Step 4: Create Tailwind config**

```javascript
// packages/dashboard/tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        lattice: {
          50: "#f0f4ff",
          100: "#dbe4ff",
          200: "#bac8ff",
          300: "#91a7ff",
          400: "#748ffc",
          500: "#5c7cfa",
          600: "#4c6ef5",
          700: "#4263eb",
          800: "#3b5bdb",
          900: "#364fc7",
          950: "#1e3a8a",
        },
      },
    },
  },
  plugins: [],
};
```

```javascript
// packages/dashboard/postcss.config.js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Create index.html**

```html
<!-- packages/dashboard/index.html -->
<!DOCTYPE html>
<html lang="en" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Lattice — Agent Control Plane</title>
  </head>
  <body class="bg-gray-950 text-gray-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create CSS and entrypoint**

```css
/* packages/dashboard/src/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

```tsx
// packages/dashboard/src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

```tsx
// packages/dashboard/src/App.tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Shell } from "./components/layout/shell.tsx";
import { AgentOverview } from "./pages/agent-overview.tsx";

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<AgentOverview />} />
          {/* Phase 3/4 routes: /flow, /tasks, /workflows */}
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
```

- [ ] **Step 7: Install dependencies**

```bash
npm install
```

- [ ] **Step 8: Verify dev server starts**

```bash
cd packages/dashboard && npx vite --port 3200
```

Expected: Vite dev server starts on port 3200. Stop after confirming.

- [ ] **Step 9: Commit**

```bash
git add packages/dashboard/
git commit -m "feat(dashboard): scaffold Vite + React + Tailwind project"
```

---

### Task 2: API Client

**Files:**
- Create: `packages/dashboard/src/lib/api.ts`

- [ ] **Step 1: Create the relay REST API client**

```typescript
// packages/dashboard/src/lib/api.ts
const BASE_URL = "/api";

export interface AgentInfo {
  name: string;
  status: string;
  card: {
    name: string;
    description: string;
    url: string;
    version: string;
    capabilities: { streaming: boolean; pushNotifications: boolean };
    skills: Array<{ id: string; name: string; description: string; tags: string[] }>;
    authentication: { schemes: string[] };
  };
}

export interface TaskInfo {
  id: string;
  status: string;
  artifacts: Array<{ name: string; parts: Array<{ type: string; text?: string }> }>;
  history: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>;
  metadata: {
    createdAt: string;
    updatedAt: string;
    assignedAgent: string;
    routingReason: string;
    latencyMs: number;
    cost?: number;
  };
}

export async function fetchAgents(): Promise<AgentInfo[]> {
  const res = await fetch(`${BASE_URL}/agents`);
  if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`);
  return res.json();
}

export async function fetchTasks(status?: string): Promise<TaskInfo[]> {
  const url = status ? `${BASE_URL}/tasks?status=${status}` : `${BASE_URL}/tasks`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch tasks: ${res.status}`);
  return res.json();
}

export async function createTask(text: string, agent?: string): Promise<TaskInfo> {
  const res = await fetch(`${BASE_URL}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, agent, execute: true }),
  });
  if (!res.ok) throw new Error(`Failed to create task: ${res.status}`);
  return res.json();
}

export async function cancelTask(taskId: string): Promise<TaskInfo> {
  const res = await fetch(`${BASE_URL}/tasks/${taskId}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to cancel task: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/lib/api.ts
git commit -m "feat(dashboard): add relay REST API client"
```

---

### Task 3: Zustand Store

**Files:**
- Create: `packages/dashboard/src/store/lattice-store.ts`

- [ ] **Step 1: Create the store**

```typescript
// packages/dashboard/src/store/lattice-store.ts
import { create } from "zustand";
import type { AgentInfo, TaskInfo } from "../lib/api.ts";

interface LatticeState {
  // Data
  agents: AgentInfo[];
  tasks: TaskInfo[];
  connectionStatus: "connecting" | "connected" | "disconnected";

  // Actions
  setAgents: (agents: AgentInfo[]) => void;
  updateAgent: (name: string, update: Partial<AgentInfo>) => void;
  addTask: (task: TaskInfo) => void;
  updateTask: (taskId: string, update: Partial<TaskInfo>) => void;
  setConnectionStatus: (status: LatticeState["connectionStatus"]) => void;

  // SSE event handlers
  handleSSEEvent: (event: { type: string; [key: string]: unknown }) => void;
}

export const useLatticeStore = create<LatticeState>((set, get) => ({
  agents: [],
  tasks: [],
  connectionStatus: "disconnected",

  setAgents: (agents) => set({ agents }),

  updateAgent: (name, update) =>
    set((state) => ({
      agents: state.agents.map((a) => (a.name === name ? { ...a, ...update } : a)),
    })),

  addTask: (task) =>
    set((state) => ({
      tasks: [task, ...state.tasks],
    })),

  updateTask: (taskId, update) =>
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === taskId ? { ...t, ...update } : t)),
    })),

  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),

  handleSSEEvent: (event) => {
    const state = get();
    switch (event.type) {
      case "agent:registered":
        set({
          agents: [
            ...state.agents.filter((a) => a.name !== (event.agent as AgentInfo["card"]).name),
            { name: (event.agent as AgentInfo["card"]).name, status: "online", card: event.agent as AgentInfo["card"] },
          ],
        });
        break;

      case "agent:deregistered":
        set({ agents: state.agents.filter((a) => a.name !== event.agentName) });
        break;

      case "agent:status":
        state.updateAgent(event.agentName as string, { status: event.status as string });
        break;

      case "task:created":
        state.addTask(event.task as TaskInfo);
        break;

      case "task:completed":
      case "task:failed":
      case "task:canceled":
        if (event.task) {
          state.updateTask((event.task as TaskInfo).id, event.task as Partial<TaskInfo>);
        } else if (event.taskId) {
          state.updateTask(event.taskId as string, {
            status: event.type.split(":")[1],
          });
        }
        break;

      case "task:routed":
        state.updateTask(event.taskId as string, {
          status: "working",
          metadata: {
            ...state.tasks.find((t) => t.id === event.taskId)?.metadata!,
            assignedAgent: event.agentName as string,
            routingReason: event.reason as string,
          },
        });
        break;
    }
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/store/lattice-store.ts
git commit -m "feat(dashboard): add Zustand store with SSE event handling"
```

---

### Task 4: SSE Hook

**Files:**
- Create: `packages/dashboard/src/hooks/use-sse.ts`

- [ ] **Step 1: Create the SSE hook**

```typescript
// packages/dashboard/src/hooks/use-sse.ts
import { useEffect, useRef } from "react";
import { useLatticeStore } from "../store/lattice-store.ts";

export function useSSE() {
  const handleSSEEvent = useLatticeStore((s) => s.handleSSEEvent);
  const setConnectionStatus = useLatticeStore((s) => s.setConnectionStatus);
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const url = lastEventIdRef.current
        ? `/api/events?lastEventId=${lastEventIdRef.current}`
        : "/api/events";

      es = new EventSource(url);
      setConnectionStatus("connecting");

      es.onopen = () => {
        setConnectionStatus("connected");
      };

      es.onmessage = (event) => {
        if (event.lastEventId) {
          lastEventIdRef.current = event.lastEventId;
        }
        try {
          const data = JSON.parse(event.data);
          handleSSEEvent(data);
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        setConnectionStatus("disconnected");
        es?.close();
        // Reconnect after 3 seconds
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [handleSSEEvent, setConnectionStatus]);
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/hooks/use-sse.ts
git commit -m "feat(dashboard): add SSE connection hook with auto-reconnect"
```

---

### Task 5: Layout Shell + Sidebar

**Files:**
- Create: `packages/dashboard/src/components/layout/sidebar.tsx`
- Create: `packages/dashboard/src/components/layout/shell.tsx`

- [ ] **Step 1: Create the sidebar**

```tsx
// packages/dashboard/src/components/layout/sidebar.tsx
import { NavLink } from "react-router-dom";
import { Activity, Layout, ListTodo, GitBranch } from "lucide-react";
import { useLatticeStore } from "../../store/lattice-store.ts";
import { clsx } from "clsx";

const navItems = [
  { to: "/", icon: Layout, label: "Agents" },
  { to: "/flow", icon: Activity, label: "Live Flow", disabled: true },
  { to: "/tasks", icon: ListTodo, label: "Tasks", disabled: true },
  { to: "/workflows", icon: GitBranch, label: "Workflows", disabled: true },
];

export function Sidebar() {
  const connectionStatus = useLatticeStore((s) => s.connectionStatus);

  return (
    <aside className="flex h-screen w-56 flex-col border-r border-gray-800 bg-gray-950">
      <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-4">
        <div className="h-6 w-6 rounded bg-lattice-600 flex items-center justify-center text-xs font-bold">
          L
        </div>
        <span className="text-sm font-semibold tracking-wide">LATTICE</span>
      </div>

      <nav className="flex-1 px-2 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              clsx(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-gray-800 text-white"
                  : "text-gray-400 hover:bg-gray-900 hover:text-gray-200",
                item.disabled && "pointer-events-none opacity-40"
              )
            }
          >
            <item.icon className="h-4 w-4" />
            {item.label}
            {item.disabled && (
              <span className="ml-auto text-[10px] uppercase tracking-wider text-gray-600">
                Soon
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <div
            className={clsx(
              "h-2 w-2 rounded-full",
              connectionStatus === "connected" && "bg-emerald-400",
              connectionStatus === "connecting" && "bg-yellow-400 animate-pulse",
              connectionStatus === "disconnected" && "bg-red-400"
            )}
          />
          {connectionStatus === "connected" ? "Connected" : connectionStatus === "connecting" ? "Connecting..." : "Disconnected"}
        </div>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Create the shell**

```tsx
// packages/dashboard/src/components/layout/shell.tsx
import type { ReactNode } from "react";
import { Sidebar } from "./sidebar.tsx";
import { useSSE } from "../../hooks/use-sse.ts";

export function Shell({ children }: { children: ReactNode }) {
  // Establish SSE connection at the shell level
  useSSE();

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/layout/
git commit -m "feat(dashboard): add sidebar navigation and app shell"
```

---

### Task 6: Agent Card Component

**Files:**
- Create: `packages/dashboard/src/components/agents/agent-card.tsx`

- [ ] **Step 1: Create the agent card**

```tsx
// packages/dashboard/src/components/agents/agent-card.tsx
import { motion } from "framer-motion";
import { clsx } from "clsx";
import type { AgentInfo } from "../../lib/api.ts";

interface AgentCardProps {
  agent: AgentInfo;
}

export function AgentCard({ agent }: AgentCardProps) {
  const isOnline = agent.status === "online";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={clsx(
        "rounded-lg border bg-gray-900 p-4 transition-shadow",
        isOnline ? "border-gray-700 hover:border-lattice-700 hover:shadow-lg hover:shadow-lattice-900/20" : "border-gray-800 opacity-60"
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-100">{agent.card.name}</h3>
        <div className="flex items-center gap-1.5">
          <div
            className={clsx(
              "h-2 w-2 rounded-full",
              isOnline ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-gray-600"
            )}
          />
          <span className="text-xs text-gray-500">{agent.status}</span>
        </div>
      </div>

      <p className="mt-1 text-xs text-gray-400 line-clamp-2">{agent.card.description}</p>

      <div className="mt-3 flex flex-wrap gap-1">
        {agent.card.skills.map((skill) => (
          <span
            key={skill.id}
            className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400"
          >
            {skill.name}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px] text-gray-600">
        <span>v{agent.card.version}</span>
        {agent.card.capabilities.streaming && <span>Streaming</span>}
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/components/agents/agent-card.tsx
git commit -m "feat(dashboard): add agent card component with status indicator"
```

---

### Task 7: Agent Grid Component

**Files:**
- Create: `packages/dashboard/src/components/agents/agent-grid.tsx`

- [ ] **Step 1: Create the agent grid**

```tsx
// packages/dashboard/src/components/agents/agent-grid.tsx
import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useLatticeStore } from "../../store/lattice-store.ts";
import { fetchAgents } from "../../lib/api.ts";
import { AgentCard } from "./agent-card.tsx";

export function AgentGrid() {
  const agents = useLatticeStore((s) => s.agents);
  const setAgents = useLatticeStore((s) => s.setAgents);

  // Initial load
  useEffect(() => {
    fetchAgents().then(setAgents).catch(console.error);
  }, [setAgents]);

  if (agents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-12">
        <p className="text-sm text-gray-500">No agents registered</p>
        <p className="mt-1 text-xs text-gray-600">
          Start the relay with adapters enabled to see agents here
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <AnimatePresence>
        {agents.map((agent) => (
          <AgentCard key={agent.name} agent={agent} />
        ))}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/components/agents/agent-grid.tsx
git commit -m "feat(dashboard): add agent grid with initial fetch"
```

---

### Task 8: Task Dispatch Bar

**Files:**
- Create: `packages/dashboard/src/components/tasks/task-dispatch-bar.tsx`

- [ ] **Step 1: Create the dispatch bar**

```tsx
// packages/dashboard/src/components/tasks/task-dispatch-bar.tsx
import { useState } from "react";
import { Send } from "lucide-react";
import { useLatticeStore } from "../../store/lattice-store.ts";
import { createTask } from "../../lib/api.ts";

export function TaskDispatchBar() {
  const agents = useLatticeStore((s) => s.agents);
  const [text, setText] = useState("");
  const [selectedAgent, setSelectedAgent] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || sending) return;

    setSending(true);
    try {
      await createTask(text.trim(), selectedAgent || undefined);
      setText("");
    } catch (err) {
      console.error("Failed to dispatch task:", err);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe a task for your agents..."
        className="flex-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 focus:border-lattice-600 focus:outline-none focus:ring-1 focus:ring-lattice-600"
      />
      <select
        value={selectedAgent}
        onChange={(e) => setSelectedAgent(e.target.value)}
        className="rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-300 focus:border-lattice-600 focus:outline-none"
      >
        <option value="">Auto-route</option>
        {agents
          .filter((a) => a.status === "online")
          .map((a) => (
            <option key={a.name} value={a.name}>
              {a.name}
            </option>
          ))}
      </select>
      <button
        type="submit"
        disabled={!text.trim() || sending}
        className="flex items-center gap-2 rounded-md bg-lattice-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-lattice-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Send className="h-4 w-4" />
        Send
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/dashboard/src/components/tasks/task-dispatch-bar.tsx
git commit -m "feat(dashboard): add task dispatch bar with agent selector"
```

---

### Task 9: Agent Overview Page

**Files:**
- Create: `packages/dashboard/src/pages/agent-overview.tsx`

- [ ] **Step 1: Create the overview page**

```tsx
// packages/dashboard/src/pages/agent-overview.tsx
import { TaskDispatchBar } from "../components/tasks/task-dispatch-bar.tsx";
import { AgentGrid } from "../components/agents/agent-grid.tsx";

export function AgentOverview() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-gray-100">Agent Overview</h1>
        <p className="mt-1 text-sm text-gray-500">
          Registered agents and their current status
        </p>
      </div>

      <TaskDispatchBar />

      <AgentGrid />
    </div>
  );
}
```

- [ ] **Step 2: Verify the app renders**

```bash
cd packages/dashboard && npx vite --port 3200
```

Expected: Dashboard loads on port 3200 with sidebar, dispatch bar, and empty agent grid. Stop after confirming.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/pages/agent-overview.tsx
git commit -m "feat(dashboard): add agent overview page as home"
```

---

### Task 10: Dev Script in Root package.json

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Update root dev script to run both relay and dashboard**

Add to root `package.json` scripts:

```json
"dev:dashboard": "npm run dev --workspace=packages/dashboard",
"dev:all": "npm run dev --workspace=packages/relay & npm run dev --workspace=packages/dashboard"
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "feat: add dev scripts for dashboard and combined relay+dashboard"
```
