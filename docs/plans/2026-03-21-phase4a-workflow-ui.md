# Phase 4a: Workflow UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visual workflow editor (React Flow canvas with drag-and-drop node palette and properties panel) and a workflow runner that executes saved workflows and highlights nodes in real-time via SSE events.

**Architecture:** The workflows page has two sub-views sharing a layout: an Editor tab with a React Flow canvas, a draggable node palette, and a properties panel for configuring the selected node; and a Runner tab that lists saved workflows, triggers runs, and visualizes execution progress by highlighting nodes as `workflow:step` SSE events arrive. A dedicated `workflow-store.ts` manages workflow definitions, saved workflows, runs, selected node state, and run visualization state. The existing SSE pipeline in `lattice-store.ts` is extended to forward `workflow:*` events to the workflow store.

**Tech Stack:** @xyflow/react (already installed), framer-motion (already installed), zustand (already installed), lucide-react (already installed), Tailwind CSS, clsx (already installed)

**Spec:** `docs/specs/2026-03-21-lattice-design.md` (section: Dashboard & Flow Visualization)

---

## File Structure

```
packages/dashboard/
├── src/
│   ├── App.tsx                                       # MODIFY - add /workflows route
│   ├── lib/
│   │   └── api.ts                                    # MODIFY - add workflow API functions
│   ├── store/
│   │   ├── lattice-store.ts                          # MODIFY - forward workflow SSE events
│   │   └── workflow-store.ts                         # CREATE - workflow editor + runner state
│   ├── components/
│   │   ├── layout/
│   │   │   └── sidebar.tsx                           # MODIFY - enable Workflows nav item
│   │   └── workflows/
│   │       ├── workflow-editor.tsx                   # CREATE - React Flow canvas for editing
│   │       ├── workflow-runner.tsx                   # CREATE - run visualization canvas
│   │       ├── agent-task-node.tsx                   # CREATE - custom node for agent-task type
│   │       ├── condition-node.tsx                    # CREATE - custom node for condition type
│   │       ├── node-palette.tsx                      # CREATE - draggable node type palette
│   │       ├── properties-panel.tsx                  # CREATE - config panel for selected node
│   │       ├── workflow-list.tsx                     # CREATE - saved workflows list with run button
│   │       └── workflow-edge.tsx                     # CREATE - custom edge with optional data mapping label
│   └── pages/
│       └── workflows.tsx                             # CREATE - page with Editor/Runner tabs
```

---

### Task 1: Add workflow API functions to api.ts

**Files:**
- Modify: `packages/dashboard/src/lib/api.ts`

- [ ] **Step 1: Add workflow types and API functions**

Append to `packages/dashboard/src/lib/api.ts`:

```typescript
// --- Workflow types ---

export interface AgentTaskConfig {
  agent: string;
  taskTemplate: string;
}

export interface ConditionConfig {
  field: string;
  operator: "equals" | "not_equals" | "contains" | "not_contains" | "is_empty" | "not_empty";
  value?: string;
}

export interface WorkflowNodeDef {
  id: string;
  type: "agent-task" | "condition";
  label: string;
  config: AgentTaskConfig | ConditionConfig;
}

export interface DataMapping {
  [sourceField: string]: string;
}

export interface WorkflowEdgeDef {
  source: string;
  target: string;
  dataMapping?: DataMapping;
}

export interface WorkflowDefinition {
  nodes: WorkflowNodeDef[];
  edges: WorkflowEdgeDef[];
}

export interface WorkflowInfo {
  id: string;
  name: string;
  definition: WorkflowDefinition;
  createdAt: string;
}

export interface WorkflowRunInfo {
  runId: string;
  workflowId: string;
  status: "running" | "completed" | "failed";
  context?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
}

// --- Workflow API ---

export async function fetchWorkflows(): Promise<WorkflowInfo[]> {
  const res = await fetch(`${BASE_URL}/workflows`);
  if (!res.ok) throw new Error(`Failed to fetch workflows: ${res.status}`);
  return res.json();
}

export async function createWorkflow(
  name: string,
  definition: WorkflowDefinition
): Promise<WorkflowInfo> {
  const res = await fetch(`${BASE_URL}/workflows`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, definition }),
  });
  if (!res.ok) throw new Error(`Failed to create workflow: ${res.status}`);
  return res.json();
}

export async function runWorkflow(workflowId: string): Promise<{ runId: string }> {
  const res = await fetch(`${BASE_URL}/workflows/${workflowId}/run`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to run workflow: ${res.status}`);
  return res.json();
}

export async function fetchWorkflowRuns(workflowId: string): Promise<WorkflowRunInfo[]> {
  const res = await fetch(`${BASE_URL}/workflows/${workflowId}/runs`);
  if (!res.ok) throw new Error(`Failed to fetch runs: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/lib/api.ts
git commit -m "feat(dashboard): add workflow API types and functions"
```

---

### Task 2: Create workflow Zustand store

**Files:**
- Create: `packages/dashboard/src/store/workflow-store.ts`

- [ ] **Step 1: Create the workflow store**

Create `packages/dashboard/src/store/workflow-store.ts`:

```typescript
import { create } from "zustand";
import type { WorkflowInfo, WorkflowRunInfo, WorkflowDefinition } from "../lib/api.ts";

export interface EditorNode {
  id: string;
  type: "agent-task" | "condition";
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface EditorEdge {
  id: string;
  source: string;
  target: string;
  dataMapping?: Record<string, string>;
}

export interface RunStepStatus {
  stepId: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
}

interface WorkflowState {
  // Saved workflows from server
  workflows: WorkflowInfo[];
  setWorkflows: (workflows: WorkflowInfo[]) => void;
  addWorkflow: (workflow: WorkflowInfo) => void;

  // Active tab
  activeTab: "editor" | "runner";
  setActiveTab: (tab: "editor" | "runner") => void;

  // Editor state
  editorNodes: EditorNode[];
  editorEdges: EditorEdge[];
  selectedNodeId: string | null;
  editingWorkflowId: string | null;
  workflowName: string;
  setEditorNodes: (nodes: EditorNode[]) => void;
  setEditorEdges: (edges: EditorEdge[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  addEditorNode: (node: EditorNode) => void;
  updateEditorNode: (id: string, updates: Partial<EditorNode>) => void;
  removeEditorNode: (id: string) => void;
  addEditorEdge: (edge: EditorEdge) => void;
  removeEditorEdge: (id: string) => void;
  setWorkflowName: (name: string) => void;
  setEditingWorkflowId: (id: string | null) => void;
  clearEditor: () => void;
  loadWorkflowIntoEditor: (workflow: WorkflowInfo) => void;

  // Runner state
  selectedWorkflowId: string | null;
  setSelectedWorkflowId: (id: string | null) => void;
  activeRunId: string | null;
  activeRunStatus: "idle" | "running" | "completed" | "failed";
  stepStatuses: Map<string, RunStepStatus>;
  runs: WorkflowRunInfo[];
  setRuns: (runs: WorkflowRunInfo[]) => void;

  // Runner actions driven by SSE
  startRun: (runId: string) => void;
  updateStepStatus: (stepId: string, status: RunStepStatus["status"]) => void;
  completeRun: (status: "completed" | "failed") => void;
  resetRun: () => void;
}

let nodeIdCounter = 0;

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  // Saved workflows
  workflows: [],
  setWorkflows: (workflows) => set({ workflows }),
  addWorkflow: (workflow) =>
    set((state) => ({
      workflows: [...state.workflows.filter((w) => w.id !== workflow.id), workflow],
    })),

  // Tab
  activeTab: "editor",
  setActiveTab: (activeTab) => set({ activeTab }),

  // Editor
  editorNodes: [],
  editorEdges: [],
  selectedNodeId: null,
  editingWorkflowId: null,
  workflowName: "",
  setEditorNodes: (editorNodes) => set({ editorNodes }),
  setEditorEdges: (editorEdges) => set({ editorEdges }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),

  addEditorNode: (node) =>
    set((state) => ({ editorNodes: [...state.editorNodes, node] })),

  updateEditorNode: (id, updates) =>
    set((state) => ({
      editorNodes: state.editorNodes.map((n) =>
        n.id === id ? { ...n, ...updates } : n
      ),
    })),

  removeEditorNode: (id) =>
    set((state) => ({
      editorNodes: state.editorNodes.filter((n) => n.id !== id),
      editorEdges: state.editorEdges.filter(
        (e) => e.source !== id && e.target !== id
      ),
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    })),

  addEditorEdge: (edge) =>
    set((state) => ({ editorEdges: [...state.editorEdges, edge] })),

  removeEditorEdge: (id) =>
    set((state) => ({
      editorEdges: state.editorEdges.filter((e) => e.id !== id),
    })),

  setWorkflowName: (workflowName) => set({ workflowName }),
  setEditingWorkflowId: (editingWorkflowId) => set({ editingWorkflowId }),

  clearEditor: () =>
    set({
      editorNodes: [],
      editorEdges: [],
      selectedNodeId: null,
      editingWorkflowId: null,
      workflowName: "",
    }),

  loadWorkflowIntoEditor: (workflow) => {
    const nodes: EditorNode[] = workflow.definition.nodes.map((n, i) => ({
      id: n.id,
      type: n.type,
      label: n.label,
      config: n.config as Record<string, unknown>,
      position: { x: 100 + (i % 3) * 280, y: 100 + Math.floor(i / 3) * 180 },
    }));

    const edges: EditorEdge[] = workflow.definition.edges.map((e) => ({
      id: `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      dataMapping: e.dataMapping,
    }));

    set({
      editorNodes: nodes,
      editorEdges: edges,
      selectedNodeId: null,
      editingWorkflowId: workflow.id,
      workflowName: workflow.name,
    });
  },

  // Runner
  selectedWorkflowId: null,
  setSelectedWorkflowId: (selectedWorkflowId) => set({ selectedWorkflowId }),
  activeRunId: null,
  activeRunStatus: "idle",
  stepStatuses: new Map(),
  runs: [],
  setRuns: (runs) => set({ runs }),

  startRun: (runId) => {
    const workflow = get().workflows.find(
      (w) => w.id === get().selectedWorkflowId
    );
    const steps = new Map<string, RunStepStatus>();
    if (workflow) {
      for (const node of workflow.definition.nodes) {
        steps.set(node.id, { stepId: node.id, status: "pending" });
      }
    }
    set({
      activeRunId: runId,
      activeRunStatus: "running",
      stepStatuses: steps,
    });
  },

  updateStepStatus: (stepId, status) =>
    set((state) => {
      const next = new Map(state.stepStatuses);
      next.set(stepId, { stepId, status });
      return { stepStatuses: next };
    }),

  completeRun: (status) =>
    set({ activeRunStatus: status }),

  resetRun: () =>
    set({
      activeRunId: null,
      activeRunStatus: "idle",
      stepStatuses: new Map(),
    }),
}));
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/store/workflow-store.ts
git commit -m "feat(dashboard): add workflow Zustand store for editor and runner state"
```

---

### Task 3: Forward workflow SSE events to workflow store

**Files:**
- Modify: `packages/dashboard/src/store/lattice-store.ts`

- [ ] **Step 1: Import and subscribe to workflow store in SSE handler**

Add the import at the top of `lattice-store.ts`:

```typescript
import { useWorkflowStore } from "./workflow-store.ts";
```

Add these cases at the end of the `handleSSEEvent` switch statement (before the closing `}`):

```typescript
      case "workflow:started":
        useWorkflowStore.getState().startRun(event.runId as string);
        break;

      case "workflow:step":
        useWorkflowStore.getState().updateStepStatus(
          event.stepId as string,
          event.status as "running" | "completed" | "failed" | "skipped"
        );
        break;

      case "workflow:completed":
        useWorkflowStore.getState().completeRun("completed");
        break;

      case "workflow:failed":
        useWorkflowStore.getState().completeRun("failed");
        break;
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/store/lattice-store.ts
git commit -m "feat(dashboard): forward workflow SSE events to workflow store"
```

---

### Task 4: Create custom workflow nodes (agent-task and condition)

**Files:**
- Create: `packages/dashboard/src/components/workflows/agent-task-node.tsx`
- Create: `packages/dashboard/src/components/workflows/condition-node.tsx`
- Create: `packages/dashboard/src/components/workflows/workflow-edge.tsx`

- [ ] **Step 1: Create the agent-task node component**

Create `packages/dashboard/src/components/workflows/agent-task-node.tsx`:

```typescript
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { clsx } from "clsx";
import { Bot } from "lucide-react";

export interface AgentTaskNodeData {
  label: string;
  agent: string;
  taskTemplate: string;
  stepStatus?: "pending" | "running" | "completed" | "failed" | "skipped";
  selected?: boolean;
}

export const AgentTaskNode = memo(function AgentTaskNode({
  data,
}: NodeProps & { data: AgentTaskNodeData }) {
  const status = data.stepStatus;

  return (
    <div
      className={clsx(
        "w-52 rounded-lg border bg-gray-900 p-3 transition-all duration-300",
        !status && "border-gray-700",
        status === "pending" && "border-gray-700 opacity-60",
        status === "running" && "border-lattice-500 shadow-[0_0_16px_4px_rgba(76,110,245,0.4)]",
        status === "completed" && "border-emerald-400 shadow-[0_0_12px_4px_rgba(52,211,153,0.3)]",
        status === "failed" && "border-red-400 shadow-[0_0_12px_4px_rgba(248,113,113,0.3)]",
        status === "skipped" && "border-gray-700 opacity-40",
        data.selected && "ring-2 ring-lattice-400"
      )}
    >
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-lattice-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-100 truncate">
          {data.label}
        </span>
      </div>

      <p className="mt-1 text-[10px] text-gray-500 truncate">
        Agent: {data.agent || "auto"}
      </p>
      <p className="mt-0.5 text-[10px] text-gray-600 truncate">
        {data.taskTemplate || "No template"}
      </p>

      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-gray-600 !border-gray-500"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-gray-600 !border-gray-500"
      />
    </div>
  );
});
```

- [ ] **Step 2: Create the condition node component**

Create `packages/dashboard/src/components/workflows/condition-node.tsx`:

```typescript
import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { clsx } from "clsx";
import { GitBranch } from "lucide-react";

export interface ConditionNodeData {
  label: string;
  field: string;
  operator: string;
  value?: string;
  stepStatus?: "pending" | "running" | "completed" | "failed" | "skipped";
  selected?: boolean;
}

export const ConditionNode = memo(function ConditionNode({
  data,
}: NodeProps & { data: ConditionNodeData }) {
  const status = data.stepStatus;

  return (
    <div
      className={clsx(
        "w-48 rounded-lg border bg-gray-900 p-3 transition-all duration-300",
        !status && "border-amber-800/60",
        status === "pending" && "border-amber-800/60 opacity-60",
        status === "running" && "border-amber-400 shadow-[0_0_16px_4px_rgba(251,191,36,0.3)]",
        status === "completed" && "border-emerald-400 shadow-[0_0_12px_4px_rgba(52,211,153,0.3)]",
        status === "failed" && "border-red-400 shadow-[0_0_12px_4px_rgba(248,113,113,0.3)]",
        status === "skipped" && "border-gray-700 opacity-40",
        data.selected && "ring-2 ring-lattice-400"
      )}
    >
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-amber-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-100 truncate">
          {data.label}
        </span>
      </div>

      <p className="mt-1 text-[10px] text-gray-500 truncate">
        {data.field} {data.operator} {data.value ?? ""}
      </p>

      <Handle
        type="target"
        position={Position.Top}
        className="!w-2.5 !h-2.5 !bg-gray-600 !border-gray-500"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2.5 !h-2.5 !bg-gray-600 !border-gray-500"
        id="default"
      />
    </div>
  );
});
```

- [ ] **Step 3: Create the workflow edge component**

Create `packages/dashboard/src/components/workflows/workflow-edge.tsx`:

```typescript
import { memo } from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
  EdgeLabelRenderer,
} from "@xyflow/react";

export interface WorkflowEdgeData {
  dataMapping?: Record<string, string>;
}

export const WorkflowEdge = memo(function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps & { data?: WorkflowEdgeData }) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const mappingKeys = data?.dataMapping ? Object.keys(data.dataMapping) : [];

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{ stroke: "rgba(107, 114, 128, 0.5)", strokeWidth: 2 }}
      />
      {mappingKeys.length > 0 && (
        <EdgeLabelRenderer>
          <div
            className="absolute rounded bg-gray-800 px-1.5 py-0.5 text-[9px] text-gray-400 border border-gray-700 pointer-events-none"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {mappingKeys.length} mapping{mappingKeys.length > 1 ? "s" : ""}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/workflows/agent-task-node.tsx packages/dashboard/src/components/workflows/condition-node.tsx packages/dashboard/src/components/workflows/workflow-edge.tsx
git commit -m "feat(dashboard): add custom workflow node and edge components"
```

---

### Task 5: Create node palette (drag source)

**Files:**
- Create: `packages/dashboard/src/components/workflows/node-palette.tsx`

- [ ] **Step 1: Create the node palette component**

Create `packages/dashboard/src/components/workflows/node-palette.tsx`:

```typescript
import { Bot, GitBranch } from "lucide-react";
import type { DragEvent } from "react";

const nodeBlocks = [
  {
    type: "agent-task" as const,
    label: "Agent Task",
    description: "Send a task to an agent",
    icon: Bot,
    color: "text-lattice-400",
    borderColor: "border-lattice-600/30",
  },
  {
    type: "condition" as const,
    label: "Condition",
    description: "Branch based on a field value",
    icon: GitBranch,
    color: "text-amber-400",
    borderColor: "border-amber-600/30",
  },
];

function onDragStart(event: DragEvent, nodeType: string) {
  event.dataTransfer.setData("application/lattice-node-type", nodeType);
  event.dataTransfer.effectAllowed = "move";
}

export function NodePalette() {
  return (
    <div className="space-y-2">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-1">
        Node Palette
      </h3>
      {nodeBlocks.map((block) => (
        <div
          key={block.type}
          draggable
          onDragStart={(e) => onDragStart(e, block.type)}
          className={`flex items-center gap-3 rounded-md border ${block.borderColor} bg-gray-900/80 p-2.5 cursor-grab active:cursor-grabbing hover:bg-gray-800/80 transition-colors`}
        >
          <block.icon className={`h-4 w-4 ${block.color} shrink-0`} />
          <div>
            <p className="text-xs font-medium text-gray-200">{block.label}</p>
            <p className="text-[10px] text-gray-500">{block.description}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/workflows/node-palette.tsx
git commit -m "feat(dashboard): add draggable node palette for workflow editor"
```

---

### Task 6: Create properties panel for selected node

**Files:**
- Create: `packages/dashboard/src/components/workflows/properties-panel.tsx`

- [ ] **Step 1: Create the properties panel**

Create `packages/dashboard/src/components/workflows/properties-panel.tsx`:

```typescript
import { X, Trash2 } from "lucide-react";
import { useWorkflowStore } from "../../store/workflow-store.ts";
import { useLatticeStore } from "../../store/lattice-store.ts";

export function PropertiesPanel() {
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const editorNodes = useWorkflowStore((s) => s.editorNodes);
  const updateEditorNode = useWorkflowStore((s) => s.updateEditorNode);
  const removeEditorNode = useWorkflowStore((s) => s.removeEditorNode);
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId);
  const agents = useLatticeStore((s) => s.agents);

  const node = editorNodes.find((n) => n.id === selectedNodeId);

  if (!node) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-gray-600 p-4">
        Select a node to edit its properties
      </div>
    );
  }

  function handleLabelChange(value: string) {
    if (!node) return;
    updateEditorNode(node.id, { label: value });
  }

  function handleConfigChange(key: string, value: string) {
    if (!node) return;
    updateEditorNode(node.id, {
      config: { ...node.config, [key]: value },
    });
  }

  function handleDelete() {
    if (!node) return;
    removeEditorNode(node.id);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between border-b border-gray-800 px-3 py-2">
        <h3 className="text-xs font-semibold text-gray-300">Properties</h3>
        <button
          onClick={() => setSelectedNodeId(null)}
          className="text-gray-500 hover:text-gray-300"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Label */}
        <div>
          <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
            Label
          </label>
          <input
            type="text"
            value={node.label}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 focus:border-lattice-600 focus:outline-none focus:ring-1 focus:ring-lattice-600"
          />
        </div>

        {/* Node type badge */}
        <div>
          <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
            Type
          </label>
          <span className="inline-block rounded bg-gray-800 px-2 py-1 text-[10px] text-gray-400">
            {node.type}
          </span>
        </div>

        {/* Agent Task config */}
        {node.type === "agent-task" && (
          <>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                Agent
              </label>
              <select
                value={(node.config.agent as string) ?? "auto"}
                onChange={(e) => handleConfigChange("agent", e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-300 focus:border-lattice-600 focus:outline-none"
              >
                <option value="auto">Auto (learned routing)</option>
                {agents
                  .filter((a) => a.status === "online")
                  .map((a) => (
                    <option key={a.name} value={a.name}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                Task Template
              </label>
              <textarea
                value={(node.config.taskTemplate as string) ?? ""}
                onChange={(e) => handleConfigChange("taskTemplate", e.target.value)}
                rows={3}
                placeholder="Use {{variable}} for placeholders..."
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-lattice-600 focus:outline-none focus:ring-1 focus:ring-lattice-600 resize-none"
              />
            </div>
          </>
        )}

        {/* Condition config */}
        {node.type === "condition" && (
          <>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                Field (dot notation)
              </label>
              <input
                type="text"
                value={(node.config.field as string) ?? ""}
                onChange={(e) => handleConfigChange("field", e.target.value)}
                placeholder="e.g. nodeId.status"
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-lattice-600 focus:outline-none focus:ring-1 focus:ring-lattice-600"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                Operator
              </label>
              <select
                value={(node.config.operator as string) ?? "equals"}
                onChange={(e) => handleConfigChange("operator", e.target.value)}
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-300 focus:border-lattice-600 focus:outline-none"
              >
                <option value="equals">equals</option>
                <option value="not_equals">not equals</option>
                <option value="contains">contains</option>
                <option value="not_contains">not contains</option>
                <option value="is_empty">is empty</option>
                <option value="not_empty">not empty</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
                Value
              </label>
              <input
                type="text"
                value={(node.config.value as string) ?? ""}
                onChange={(e) => handleConfigChange("value", e.target.value)}
                placeholder="Compare value (optional for is_empty)"
                className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-lattice-600 focus:outline-none focus:ring-1 focus:ring-lattice-600"
              />
            </div>
          </>
        )}
      </div>

      {/* Delete button */}
      <div className="border-t border-gray-800 p-3">
        <button
          onClick={handleDelete}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-red-900/50 bg-red-950/30 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-950/60"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete Node
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/workflows/properties-panel.tsx
git commit -m "feat(dashboard): add properties panel for workflow node configuration"
```

---

### Task 7: Create workflow editor (React Flow canvas with drag-and-drop)

**Files:**
- Create: `packages/dashboard/src/components/workflows/workflow-editor.tsx`

- [ ] **Step 1: Create the workflow editor canvas**

Create `packages/dashboard/src/components/workflows/workflow-editor.tsx`:

```typescript
import { useCallback, useRef, useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  type Node,
  type Edge,
  type Connection,
  type OnNodesChange,
  type OnEdgesChange,
  applyNodeChanges,
  applyEdgeChanges,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useWorkflowStore, type EditorNode } from "../../store/workflow-store.ts";
import { AgentTaskNode } from "./agent-task-node.tsx";
import { ConditionNode } from "./condition-node.tsx";
import { WorkflowEdge } from "./workflow-edge.tsx";
import { NodePalette } from "./node-palette.tsx";
import { PropertiesPanel } from "./properties-panel.tsx";
import { createWorkflow, type WorkflowDefinition } from "../../lib/api.ts";
import { Save, FilePlus } from "lucide-react";

const nodeTypes = {
  "agent-task": AgentTaskNode,
  condition: ConditionNode,
};

const edgeTypes = {
  workflow: WorkflowEdge,
};

let idCounter = 0;
function nextId() {
  idCounter += 1;
  return `node-${Date.now()}-${idCounter}`;
}

export function WorkflowEditor() {
  const editorNodes = useWorkflowStore((s) => s.editorNodes);
  const editorEdges = useWorkflowStore((s) => s.editorEdges);
  const selectedNodeId = useWorkflowStore((s) => s.selectedNodeId);
  const setEditorNodes = useWorkflowStore((s) => s.setEditorNodes);
  const setEditorEdges = useWorkflowStore((s) => s.setEditorEdges);
  const setSelectedNodeId = useWorkflowStore((s) => s.setSelectedNodeId);
  const addEditorNode = useWorkflowStore((s) => s.addEditorNode);
  const addEditorEdge = useWorkflowStore((s) => s.addEditorEdge);
  const workflowName = useWorkflowStore((s) => s.workflowName);
  const setWorkflowName = useWorkflowStore((s) => s.setWorkflowName);
  const editingWorkflowId = useWorkflowStore((s) => s.editingWorkflowId);
  const addWorkflow = useWorkflowStore((s) => s.addWorkflow);
  const clearEditor = useWorkflowStore((s) => s.clearEditor);

  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // Convert store nodes to React Flow nodes
  const rfNodes: Node[] = useMemo(
    () =>
      editorNodes.map((n) => ({
        id: n.id,
        type: n.type,
        position: n.position,
        data: {
          label: n.label,
          ...(n.type === "agent-task"
            ? { agent: n.config.agent ?? "auto", taskTemplate: n.config.taskTemplate ?? "" }
            : { field: n.config.field ?? "", operator: n.config.operator ?? "equals", value: n.config.value }),
          selected: n.id === selectedNodeId,
        },
        selected: n.id === selectedNodeId,
      })),
    [editorNodes, selectedNodeId]
  );

  // Convert store edges to React Flow edges
  const rfEdges: Edge[] = useMemo(
    () =>
      editorEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "workflow",
        data: { dataMapping: e.dataMapping },
      })),
    [editorEdges]
  );

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // Apply position/selection changes back to store
      const updated = applyNodeChanges(changes, rfNodes);
      const next: EditorNode[] = updated.map((rfNode) => {
        const existing = editorNodes.find((n) => n.id === rfNode.id);
        return {
          id: rfNode.id,
          type: (rfNode.type as EditorNode["type"]) ?? "agent-task",
          label: existing?.label ?? "Untitled",
          config: existing?.config ?? {},
          position: rfNode.position,
        };
      });
      setEditorNodes(next);

      // Track selection
      for (const change of changes) {
        if (change.type === "select" && change.selected) {
          setSelectedNodeId(change.id);
        }
      }
    },
    [rfNodes, editorNodes, setEditorNodes, setSelectedNodeId]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      const updated = applyEdgeChanges(changes, rfEdges);
      setEditorEdges(
        updated.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          dataMapping: (e.data as { dataMapping?: Record<string, string> })?.dataMapping,
        }))
      );
    },
    [rfEdges, setEditorEdges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (connection.source && connection.target) {
        addEditorEdge({
          id: `${connection.source}-${connection.target}`,
          source: connection.source,
          target: connection.target,
        });
      }
    },
    [addEditorEdge]
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    [setSelectedNodeId]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, [setSelectedNodeId]);

  // Handle drop from palette
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData("application/lattice-node-type");
      if (!nodeType) return;

      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = {
        x: event.clientX - bounds.left - 100,
        y: event.clientY - bounds.top - 30,
      };

      const defaultConfig =
        nodeType === "agent-task"
          ? { agent: "auto", taskTemplate: "" }
          : { field: "", operator: "equals", value: "" };

      addEditorNode({
        id: nextId(),
        type: nodeType as EditorNode["type"],
        label: nodeType === "agent-task" ? "New Task" : "Condition",
        config: defaultConfig,
        position,
      });
    },
    [addEditorNode]
  );

  // Save workflow
  async function handleSave() {
    if (!workflowName.trim()) {
      alert("Please enter a workflow name.");
      return;
    }
    if (editorNodes.length === 0) {
      alert("Add at least one node before saving.");
      return;
    }

    const definition: WorkflowDefinition = {
      nodes: editorNodes.map((n) => ({
        id: n.id,
        type: n.type,
        label: n.label,
        config: n.config as WorkflowDefinition["nodes"][number]["config"],
      })),
      edges: editorEdges.map((e) => ({
        source: e.source,
        target: e.target,
        ...(e.dataMapping ? { dataMapping: e.dataMapping } : {}),
      })),
    };

    try {
      const saved = await createWorkflow(workflowName.trim(), definition);
      addWorkflow(saved);
      alert("Workflow saved!");
    } catch (err) {
      console.error("Failed to save workflow:", err);
      alert("Failed to save workflow.");
    }
  }

  return (
    <div className="flex h-full">
      {/* Left palette */}
      <div className="w-48 shrink-0 border-r border-gray-800 p-3 space-y-4 overflow-y-auto">
        <NodePalette />

        <div className="border-t border-gray-800 pt-3">
          <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1">
            Workflow Name
          </label>
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            placeholder="My Workflow"
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-lattice-600 focus:outline-none focus:ring-1 focus:ring-lattice-600"
          />
        </div>

        <div className="space-y-2">
          <button
            onClick={handleSave}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-lattice-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-lattice-700"
          >
            <Save className="h-3.5 w-3.5" />
            Save Workflow
          </button>
          <button
            onClick={clearEditor}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-800"
          >
            <FilePlus className="h-3.5 w-3.5" />
            New Workflow
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 min-w-0" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={rfNodes}
          edges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          connectionMode={ConnectionMode.Loose}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={2}
          defaultEdgeOptions={{ type: "workflow" }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="rgba(75, 85, 99, 0.15)"
          />
          <Controls
            className="!bg-gray-900 !border-gray-700 !rounded-md [&>button]:!bg-gray-800 [&>button]:!border-gray-700 [&>button]:!text-gray-400 [&>button:hover]:!bg-gray-700"
          />
        </ReactFlow>
      </div>

      {/* Right properties panel */}
      <div className="w-56 shrink-0 border-l border-gray-800 overflow-y-auto">
        <PropertiesPanel />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/workflows/workflow-editor.tsx
git commit -m "feat(dashboard): add workflow editor with React Flow canvas and drag-and-drop"
```

---

### Task 8: Create workflow list and runner visualization

**Files:**
- Create: `packages/dashboard/src/components/workflows/workflow-list.tsx`
- Create: `packages/dashboard/src/components/workflows/workflow-runner.tsx`

- [ ] **Step 1: Create the workflow list component**

Create `packages/dashboard/src/components/workflows/workflow-list.tsx`:

```typescript
import { Play, Pencil, Clock } from "lucide-react";
import { useWorkflowStore } from "../../store/workflow-store.ts";
import { runWorkflow, fetchWorkflowRuns } from "../../lib/api.ts";
import { clsx } from "clsx";

export function WorkflowList() {
  const workflows = useWorkflowStore((s) => s.workflows);
  const selectedWorkflowId = useWorkflowStore((s) => s.selectedWorkflowId);
  const setSelectedWorkflowId = useWorkflowStore((s) => s.setSelectedWorkflowId);
  const activeRunStatus = useWorkflowStore((s) => s.activeRunStatus);
  const startRun = useWorkflowStore((s) => s.startRun);
  const setRuns = useWorkflowStore((s) => s.setRuns);
  const setActiveTab = useWorkflowStore((s) => s.setActiveTab);
  const loadWorkflowIntoEditor = useWorkflowStore((s) => s.loadWorkflowIntoEditor);

  async function handleRun(workflowId: string) {
    setSelectedWorkflowId(workflowId);
    try {
      const { runId } = await runWorkflow(workflowId);
      startRun(runId);
    } catch (err) {
      console.error("Failed to run workflow:", err);
    }
  }

  async function handleSelect(workflowId: string) {
    setSelectedWorkflowId(workflowId);
    try {
      const runs = await fetchWorkflowRuns(workflowId);
      setRuns(runs);
    } catch (err) {
      console.error("Failed to fetch runs:", err);
    }
  }

  function handleEdit(workflowId: string) {
    const wf = workflows.find((w) => w.id === workflowId);
    if (wf) {
      loadWorkflowIntoEditor(wf);
      setActiveTab("editor");
    }
  }

  if (workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center">
        <p className="text-sm text-gray-500">No workflows saved yet.</p>
        <p className="text-xs text-gray-600 mt-1">
          Create one in the Editor tab.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {workflows.map((wf) => (
        <div
          key={wf.id}
          onClick={() => handleSelect(wf.id)}
          className={clsx(
            "rounded-lg border bg-gray-900/80 p-3 cursor-pointer transition-colors",
            selectedWorkflowId === wf.id
              ? "border-lattice-600 bg-gray-900"
              : "border-gray-800 hover:border-gray-700"
          )}
        >
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-gray-100">{wf.name}</h4>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleEdit(wf.id);
                }}
                title="Edit workflow"
                className="rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleRun(wf.id);
                }}
                disabled={activeRunStatus === "running"}
                title="Run workflow"
                className="rounded p-1 text-emerald-500 hover:bg-gray-800 hover:text-emerald-400 transition-colors disabled:opacity-40"
              >
                <Play className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-500">
            <span>{wf.definition.nodes.length} nodes</span>
            <span className="text-gray-700">|</span>
            <span>{wf.definition.edges.length} edges</span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create the workflow runner visualization**

Create `packages/dashboard/src/components/workflows/workflow-runner.tsx`:

```typescript
import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useWorkflowStore } from "../../store/workflow-store.ts";
import { AgentTaskNode } from "./agent-task-node.tsx";
import { ConditionNode } from "./condition-node.tsx";
import { WorkflowEdge } from "./workflow-edge.tsx";
import { WorkflowList } from "./workflow-list.tsx";
import { clsx } from "clsx";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

const nodeTypes = {
  "agent-task": AgentTaskNode,
  condition: ConditionNode,
};

const edgeTypes = {
  workflow: WorkflowEdge,
};

export function WorkflowRunner() {
  const workflows = useWorkflowStore((s) => s.workflows);
  const selectedWorkflowId = useWorkflowStore((s) => s.selectedWorkflowId);
  const activeRunStatus = useWorkflowStore((s) => s.activeRunStatus);
  const stepStatuses = useWorkflowStore((s) => s.stepStatuses);
  const resetRun = useWorkflowStore((s) => s.resetRun);

  const workflow = workflows.find((w) => w.id === selectedWorkflowId);

  // Build React Flow nodes with step status overlays
  const { nodes, edges } = useMemo(() => {
    if (!workflow) return { nodes: [], edges: [] };

    const rfNodes: Node[] = workflow.definition.nodes.map((n, i) => ({
      id: n.id,
      type: n.type,
      position: { x: 100 + (i % 3) * 280, y: 100 + Math.floor(i / 3) * 180 },
      data: {
        label: n.label,
        ...(n.type === "agent-task"
          ? {
              agent: (n.config as { agent: string }).agent,
              taskTemplate: (n.config as { taskTemplate: string }).taskTemplate,
            }
          : {
              field: (n.config as { field: string }).field,
              operator: (n.config as { operator: string }).operator,
              value: (n.config as { value?: string }).value,
            }),
        stepStatus: stepStatuses.get(n.id)?.status,
      },
      draggable: false,
      selectable: false,
    }));

    const rfEdges: Edge[] = workflow.definition.edges.map((e) => ({
      id: `${e.source}-${e.target}`,
      source: e.source,
      target: e.target,
      type: "workflow",
      data: { dataMapping: e.dataMapping },
    }));

    return { nodes: rfNodes, edges: rfEdges };
  }, [workflow, stepStatuses]);

  return (
    <div className="flex h-full">
      {/* Left workflow list */}
      <div className="w-64 shrink-0 border-r border-gray-800 p-3 overflow-y-auto">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-3">
          Saved Workflows
        </h3>
        <WorkflowList />
      </div>

      {/* Canvas area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Run status bar */}
        {activeRunStatus !== "idle" && (
          <div
            className={clsx(
              "flex items-center gap-2 px-4 py-2 text-xs border-b",
              activeRunStatus === "running" && "bg-lattice-950/50 border-lattice-800 text-lattice-300",
              activeRunStatus === "completed" && "bg-emerald-950/50 border-emerald-800 text-emerald-300",
              activeRunStatus === "failed" && "bg-red-950/50 border-red-800 text-red-300"
            )}
          >
            {activeRunStatus === "running" && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Workflow running...
              </>
            )}
            {activeRunStatus === "completed" && (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Workflow completed
              </>
            )}
            {activeRunStatus === "failed" && (
              <>
                <XCircle className="h-3.5 w-3.5" />
                Workflow failed
              </>
            )}
            <button
              onClick={resetRun}
              className="ml-auto text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Flow canvas or empty state */}
        {workflow ? (
          <div className="flex-1 min-h-0">
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
              nodesDraggable={false}
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
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-gray-600">
              Select a workflow to view and run it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/workflows/workflow-list.tsx packages/dashboard/src/components/workflows/workflow-runner.tsx
git commit -m "feat(dashboard): add workflow list and runner visualization"
```

---

### Task 9: Create workflows page with Editor/Runner tabs

**Files:**
- Create: `packages/dashboard/src/pages/workflows.tsx`

- [ ] **Step 1: Create the workflows page**

Create `packages/dashboard/src/pages/workflows.tsx`:

```typescript
import { useEffect } from "react";
import { clsx } from "clsx";
import { Pencil, Play } from "lucide-react";
import { useWorkflowStore } from "../store/workflow-store.ts";
import { fetchWorkflows } from "../lib/api.ts";
import { WorkflowEditor } from "../components/workflows/workflow-editor.tsx";
import { WorkflowRunner } from "../components/workflows/workflow-runner.tsx";

const tabs = [
  { id: "editor" as const, label: "Editor", icon: Pencil },
  { id: "runner" as const, label: "Runner", icon: Play },
];

export function Workflows() {
  const activeTab = useWorkflowStore((s) => s.activeTab);
  const setActiveTab = useWorkflowStore((s) => s.setActiveTab);
  const setWorkflows = useWorkflowStore((s) => s.setWorkflows);

  // Load workflows on mount
  useEffect(() => {
    fetchWorkflows()
      .then((wfs) => setWorkflows(wfs))
      .catch((err) => console.error("Failed to fetch workflows:", err));
  }, [setWorkflows]);

  return (
    <div className="flex h-full flex-col -m-6">
      {/* Tab bar */}
      <div className="shrink-0 border-b border-gray-800 px-4">
        <div className="flex items-center gap-4">
          <h1 className="text-sm font-semibold text-gray-100 py-3">
            Workflows
          </h1>
          <div className="flex gap-1 ml-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-t-md px-3 py-2 text-xs font-medium transition-colors",
                  activeTab === tab.id
                    ? "bg-gray-800 text-gray-100 border-b-2 border-lattice-500"
                    : "text-gray-500 hover:text-gray-300"
                )}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0">
        {activeTab === "editor" ? <WorkflowEditor /> : <WorkflowRunner />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/pages/workflows.tsx
git commit -m "feat(dashboard): add workflows page with editor/runner tabs"
```

---

### Task 10: Wire up routing, enable sidebar nav, and verify

**Files:**
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add the /workflows route to App.tsx**

Replace the contents of `packages/dashboard/src/App.tsx`:

```typescript
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Shell } from "./components/layout/shell.tsx";
import { AgentOverview } from "./pages/agent-overview.tsx";
import { LiveFlow } from "./pages/live-flow.tsx";
import { Workflows } from "./pages/workflows.tsx";

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<AgentOverview />} />
          <Route path="/flow" element={<LiveFlow />} />
          <Route path="/workflows" element={<Workflows />} />
          {/* Phase 4 routes: /tasks */}
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
```

- [ ] **Step 2: Enable the Workflows nav item in sidebar.tsx**

In `packages/dashboard/src/components/layout/sidebar.tsx`, change the Workflows nav item to remove `disabled: true`:

```typescript
const navItems = [
  { to: "/", icon: Layout, label: "Agents" },
  { to: "/flow", icon: Activity, label: "Live Flow" },
  { to: "/tasks", icon: ListTodo, label: "Tasks", disabled: true },
  { to: "/workflows", icon: GitBranch, label: "Workflows" },
];
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx tsc --noEmit
```

- [ ] **Step 4: Verify the dev server starts without errors**

```bash
cd /Users/basilliu/lattice/packages/dashboard && npx vite build
```

Expected: build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/App.tsx packages/dashboard/src/components/layout/sidebar.tsx
git commit -m "feat(dashboard): wire up /workflows route and enable sidebar nav"
```
