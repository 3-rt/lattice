# Phase 3b: Workflow Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a DAG-based workflow engine that executes multi-step agent pipelines with parallel branches, condition nodes, and data mapping between steps — all wired through the existing task manager and event bus.

**Architecture:** The workflow engine is a pure module (`workflow-engine.ts`) that receives `db`, `taskManager`, and `eventBus` via constructor injection. Workflows are stored as JSON DAGs (nodes + edges) in SQLite. Execution performs topological sort, then walks the sorted layers — nodes whose dependencies are all satisfied run concurrently via `Promise.all`. Each `agent-task` node creates a real A2A task through the task manager. A shared `context` map (keyed by node ID) carries outputs between nodes. Condition nodes evaluate simple rules against context values to gate downstream branches.

**Tech Stack:** TypeScript, Vitest, better-sqlite3 (existing), uuid

**Spec:** `docs/specs/2026-03-21-lattice-design.md` (section: Workflow Engine)

---

## File Structure

```
packages/relay/
├── src/
│   ├── db.ts                    # Modify: add workflow DB methods to LatticeDB interface
│   ├── workflow-types.ts        # Create: WorkflowDefinition, WorkflowNode, WorkflowEdge, etc.
│   ├── workflow-topo.ts         # Create: topological sort utility
│   ├── workflow-condition.ts    # Create: condition evaluator
│   ├── workflow-engine.ts       # Create: engine core
│   ├── server.ts                # Modify: add workflow API routes
│   └── index.ts                 # Modify: re-export workflow engine
├── tests/
│   ├── workflow-db.test.ts      # Create
│   ├── workflow-topo.test.ts    # Create
│   ├── workflow-condition.test.ts # Create
│   ├── workflow-engine.test.ts  # Create
│   └── workflow-api.test.ts     # Create
workflows/
├── bug-fix-pipeline.json        # Create: demo workflow
└── code-review.json             # Create: demo workflow
```

---

### Task 1: Workflow DB Methods

**Files:**
- Modify: `packages/relay/src/db.ts`
- Create: `packages/relay/tests/workflow-db.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/workflow-db.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type LatticeDB } from "../src/db.js";

describe("Workflow DB methods", () => {
  let db: LatticeDB;

  beforeEach(() => {
    db = createDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("workflows", () => {
    it("should insert and retrieve a workflow", () => {
      const definition = {
        nodes: [{ id: "n1", type: "agent-task", label: "Step 1", config: { agent: "auto", taskTemplate: "do something" } }],
        edges: [],
      };
      db.insertWorkflow("wf-1", "Test Workflow", definition);
      const wf = db.getWorkflow("wf-1");

      expect(wf).toBeDefined();
      expect(wf!.id).toBe("wf-1");
      expect(wf!.name).toBe("Test Workflow");
      expect(JSON.parse(wf!.definition)).toEqual(definition);
    });

    it("should list all workflows", () => {
      const def = { nodes: [], edges: [] };
      db.insertWorkflow("wf-1", "First", def);
      db.insertWorkflow("wf-2", "Second", def);

      const workflows = db.listWorkflows();
      expect(workflows).toHaveLength(2);
    });

    it("should return undefined for missing workflow", () => {
      expect(db.getWorkflow("nonexistent")).toBeUndefined();
    });
  });

  describe("workflow_runs", () => {
    it("should insert and retrieve a workflow run", () => {
      const def = { nodes: [], edges: [] };
      db.insertWorkflow("wf-1", "Test", def);
      db.insertWorkflowRun("run-1", "wf-1");

      const run = db.getWorkflowRun("run-1");
      expect(run).toBeDefined();
      expect(run!.id).toBe("run-1");
      expect(run!.workflow_id).toBe("wf-1");
      expect(run!.status).toBe("pending");
    });

    it("should update a workflow run status and context", () => {
      const def = { nodes: [], edges: [] };
      db.insertWorkflow("wf-1", "Test", def);
      db.insertWorkflowRun("run-1", "wf-1");

      const context = { n1: { status: "completed", output: "done" } };
      db.updateWorkflowRun("run-1", { status: "running", context });

      const run = db.getWorkflowRun("run-1");
      expect(run!.status).toBe("running");
      expect(JSON.parse(run!.context!)).toEqual(context);
    });

    it("should update completed_at when status is completed", () => {
      const def = { nodes: [], edges: [] };
      db.insertWorkflow("wf-1", "Test", def);
      db.insertWorkflowRun("run-1", "wf-1");

      db.updateWorkflowRun("run-1", { status: "completed" });
      const run = db.getWorkflowRun("run-1");
      expect(run!.completed_at).toBeDefined();
    });

    it("should list runs for a specific workflow", () => {
      const def = { nodes: [], edges: [] };
      db.insertWorkflow("wf-1", "Test", def);
      db.insertWorkflow("wf-2", "Other", def);
      db.insertWorkflowRun("run-1", "wf-1");
      db.insertWorkflowRun("run-2", "wf-1");
      db.insertWorkflowRun("run-3", "wf-2");

      const runs = db.listWorkflowRuns("wf-1");
      expect(runs).toHaveLength(2);
      expect(runs.every((r) => r.workflow_id === "wf-1")).toBe(true);
    });

    it("should return undefined for missing run", () => {
      expect(db.getWorkflowRun("nonexistent")).toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/relay/tests/workflow-db.test.ts`
Expected: FAIL with "db.insertWorkflow is not a function"

- [ ] **Step 3: Write minimal implementation**

Add these row types and interface methods to `packages/relay/src/db.ts`:

```typescript
// Add after RoutingStatsRow interface
export interface WorkflowRow {
  id: string;
  name: string;
  definition: string; // JSON serialized WorkflowDefinition
  created_at: string;
}

export interface WorkflowRunRow {
  id: string;
  workflow_id: string;
  status: string;
  context: string | null; // JSON serialized context map
  started_at: string;
  completed_at: string | null;
}

export interface WorkflowRunUpdate {
  status?: string;
  context?: Record<string, unknown>;
}
```

Add to the `LatticeDB` interface:

```typescript
  // Workflow methods
  insertWorkflow(id: string, name: string, definition: Record<string, unknown>): void;
  getWorkflow(id: string): WorkflowRow | undefined;
  listWorkflows(): WorkflowRow[];
  insertWorkflowRun(id: string, workflowId: string): void;
  updateWorkflowRun(id: string, update: WorkflowRunUpdate): void;
  getWorkflowRun(id: string): WorkflowRunRow | undefined;
  listWorkflowRuns(workflowId: string): WorkflowRunRow[];
```

Add prepared statements inside `createDatabase`:

```typescript
    insertWorkflow: sqlite.prepare(`
      INSERT INTO workflows (id, name, definition) VALUES (?, ?, ?)
    `),
    getWorkflow: sqlite.prepare(`SELECT * FROM workflows WHERE id = ?`),
    listWorkflows: sqlite.prepare(`SELECT * FROM workflows`),
    insertWorkflowRun: sqlite.prepare(`
      INSERT INTO workflow_runs (id, workflow_id) VALUES (?, ?)
    `),
    getWorkflowRun: sqlite.prepare(`SELECT * FROM workflow_runs WHERE id = ?`),
    listWorkflowRuns: sqlite.prepare(`SELECT * FROM workflow_runs WHERE workflow_id = ?`),
```

Add the implementation methods in the returned object:

```typescript
    insertWorkflow(id: string, name: string, definition: Record<string, unknown>): void {
      stmts.insertWorkflow.run(id, name, JSON.stringify(definition));
    },
    getWorkflow(id: string): WorkflowRow | undefined {
      return stmts.getWorkflow.get(id) as WorkflowRow | undefined;
    },
    listWorkflows(): WorkflowRow[] {
      return stmts.listWorkflows.all() as WorkflowRow[];
    },
    insertWorkflowRun(id: string, workflowId: string): void {
      stmts.insertWorkflowRun.run(id, workflowId);
    },
    updateWorkflowRun(id: string, update: WorkflowRunUpdate): void {
      const fields: string[] = [];
      const values: unknown[] = [];

      if (update.status !== undefined) {
        fields.push("status = ?");
        values.push(update.status);
        if (update.status === "completed" || update.status === "failed") {
          fields.push("completed_at = datetime('now')");
        }
      }
      if (update.context !== undefined) {
        fields.push("context = ?");
        values.push(JSON.stringify(update.context));
      }
      if (fields.length === 0) return;
      values.push(id);
      const sql = `UPDATE workflow_runs SET ${fields.join(", ")} WHERE id = ?`;
      sqlite.prepare(sql).run(...values);
    },
    getWorkflowRun(id: string): WorkflowRunRow | undefined {
      return stmts.getWorkflowRun.get(id) as WorkflowRunRow | undefined;
    },
    listWorkflowRuns(workflowId: string): WorkflowRunRow[] {
      return stmts.listWorkflowRuns.all(workflowId) as WorkflowRunRow[];
    },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/relay/tests/workflow-db.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/db.ts packages/relay/tests/workflow-db.test.ts
git commit -m "feat(relay): add workflow DB methods for workflows and workflow_runs"
```

---

### Task 2: Workflow Type Definitions

**Files:**
- Create: `packages/relay/src/workflow-types.ts`

- [ ] **Step 1: Write the type definitions**

```typescript
// packages/relay/src/workflow-types.ts

export interface WorkflowNode {
  id: string;
  type: "agent-task" | "condition";
  label: string;
  config: AgentTaskConfig | ConditionConfig;
}

export interface AgentTaskConfig {
  agent: string; // agent name or "auto" for learned routing
  taskTemplate: string; // supports {{variableName}} placeholders
}

export interface ConditionConfig {
  field: string; // dot notation reference into context, e.g. "nodeId.status"
  operator: "equals" | "not_equals" | "contains" | "not_contains" | "is_empty" | "not_empty";
  value?: string; // not required for is_empty / not_empty
}

export interface DataMapping {
  [sourceField: string]: string; // source_field -> target_field
}

export interface WorkflowEdge {
  source: string; // source node ID
  target: string; // target node ID
  dataMapping?: DataMapping;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowContext {
  [nodeId: string]: NodeOutput;
}

export interface NodeOutput {
  status: "completed" | "failed" | "skipped";
  result?: string; // text output from the task
  artifacts?: Array<{ name: string; parts: Array<{ type: string; text?: string }> }>;
  data?: Record<string, unknown>; // mapped data from incoming edges
  conditionResult?: boolean; // for condition nodes
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p packages/relay/tsconfig.json`
Expected: No errors (or run `npx vitest run packages/relay/tests/workflow-db.test.ts` to confirm nothing is broken)

- [ ] **Step 3: Commit**

```bash
git add packages/relay/src/workflow-types.ts
git commit -m "feat(relay): add workflow type definitions (nodes, edges, context)"
```

---

### Task 3: Topological Sort

**Files:**
- Create: `packages/relay/src/workflow-topo.ts`
- Create: `packages/relay/tests/workflow-topo.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/workflow-topo.test.ts
import { describe, it, expect } from "vitest";
import { topoSort } from "../src/workflow-topo.js";
import type { WorkflowDefinition } from "../src/workflow-types.js";

describe("topoSort", () => {
  it("should return single node in one layer", () => {
    const def: WorkflowDefinition = {
      nodes: [{ id: "a", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "do A" } }],
      edges: [],
    };
    const layers = topoSort(def);
    expect(layers).toEqual([["a"]]);
  });

  it("should return linear chain as sequential layers", () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "a", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "do A" } },
        { id: "b", type: "agent-task", label: "B", config: { agent: "auto", taskTemplate: "do B" } },
        { id: "c", type: "agent-task", label: "C", config: { agent: "auto", taskTemplate: "do C" } },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ],
    };
    const layers = topoSort(def);
    expect(layers).toEqual([["a"], ["b"], ["c"]]);
  });

  it("should group parallel branches in the same layer", () => {
    // a -> b, a -> c, b -> d, c -> d
    const def: WorkflowDefinition = {
      nodes: [
        { id: "a", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "do A" } },
        { id: "b", type: "agent-task", label: "B", config: { agent: "auto", taskTemplate: "do B" } },
        { id: "c", type: "agent-task", label: "C", config: { agent: "auto", taskTemplate: "do C" } },
        { id: "d", type: "agent-task", label: "D", config: { agent: "auto", taskTemplate: "do D" } },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
        { source: "b", target: "d" },
        { source: "c", target: "d" },
      ],
    };
    const layers = topoSort(def);
    expect(layers).toEqual([["a"], expect.arrayContaining(["b", "c"]), ["d"]]);
    expect(layers[1]).toHaveLength(2);
  });

  it("should throw on cycle", () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "a", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "do A" } },
        { id: "b", type: "agent-task", label: "B", config: { agent: "auto", taskTemplate: "do B" } },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ],
    };
    expect(() => topoSort(def)).toThrow("cycle");
  });

  it("should handle multiple roots", () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "a", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "do A" } },
        { id: "b", type: "agent-task", label: "B", config: { agent: "auto", taskTemplate: "do B" } },
        { id: "c", type: "agent-task", label: "C", config: { agent: "auto", taskTemplate: "do C" } },
      ],
      edges: [
        { source: "a", target: "c" },
        { source: "b", target: "c" },
      ],
    };
    const layers = topoSort(def);
    expect(layers[0]).toHaveLength(2);
    expect(layers[0]).toEqual(expect.arrayContaining(["a", "b"]));
    expect(layers[1]).toEqual(["c"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/relay/tests/workflow-topo.test.ts`
Expected: FAIL with "Cannot find module" or similar

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/relay/src/workflow-topo.ts
import type { WorkflowDefinition } from "./workflow-types.js";

/**
 * Kahn's algorithm — returns layers of node IDs that can execute in parallel.
 * Each layer's nodes have all dependencies satisfied by prior layers.
 * Throws if the graph contains a cycle.
 */
export function topoSort(def: WorkflowDefinition): string[][] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // node -> nodes that depend on it

  for (const node of def.nodes) {
    inDegree.set(node.id, 0);
    dependents.set(node.id, []);
  }

  for (const edge of def.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    dependents.get(edge.source)?.push(edge.target);
  }

  const layers: string[][] = [];
  let queue = def.nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id);
  let processed = 0;

  while (queue.length > 0) {
    layers.push([...queue]);
    processed += queue.length;

    const nextQueue: string[] = [];
    for (const nodeId of queue) {
      for (const dep of dependents.get(nodeId) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) {
          nextQueue.push(dep);
        }
      }
    }
    queue = nextQueue;
  }

  if (processed !== def.nodes.length) {
    throw new Error("Workflow graph contains a cycle");
  }

  return layers;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/relay/tests/workflow-topo.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/workflow-topo.ts packages/relay/tests/workflow-topo.test.ts
git commit -m "feat(relay): add topological sort for workflow DAG execution ordering"
```

---

### Task 4: Condition Evaluator

**Files:**
- Create: `packages/relay/src/workflow-condition.ts`
- Create: `packages/relay/tests/workflow-condition.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/workflow-condition.test.ts
import { describe, it, expect } from "vitest";
import { evaluateCondition, resolveContextValue } from "../src/workflow-condition.js";
import type { ConditionConfig, WorkflowContext } from "../src/workflow-types.js";

describe("resolveContextValue", () => {
  const context: WorkflowContext = {
    n1: {
      status: "completed",
      result: "Bug found in auth module",
      artifacts: [{ name: "output", parts: [{ type: "text", text: "fixed the bug" }] }],
    },
    n2: {
      status: "failed",
      result: "",
    },
  };

  it("should resolve a top-level field", () => {
    expect(resolveContextValue(context, "n1.status")).toBe("completed");
  });

  it("should resolve a nested field", () => {
    expect(resolveContextValue(context, "n1.result")).toBe("Bug found in auth module");
  });

  it("should resolve array-indexed field with bracket notation", () => {
    expect(resolveContextValue(context, "n1.artifacts[0].parts[0].text")).toBe("fixed the bug");
  });

  it("should return undefined for missing path", () => {
    expect(resolveContextValue(context, "n1.nonexistent")).toBeUndefined();
  });

  it("should return undefined for missing node", () => {
    expect(resolveContextValue(context, "n99.status")).toBeUndefined();
  });
});

describe("evaluateCondition", () => {
  const context: WorkflowContext = {
    n1: { status: "completed", result: "Bug found in auth module" },
    n2: { status: "completed", result: "" },
  };

  it("equals: true when values match", () => {
    const config: ConditionConfig = { field: "n1.status", operator: "equals", value: "completed" };
    expect(evaluateCondition(config, context)).toBe(true);
  });

  it("equals: false when values differ", () => {
    const config: ConditionConfig = { field: "n1.status", operator: "equals", value: "failed" };
    expect(evaluateCondition(config, context)).toBe(false);
  });

  it("not_equals: true when values differ", () => {
    const config: ConditionConfig = { field: "n1.status", operator: "not_equals", value: "failed" };
    expect(evaluateCondition(config, context)).toBe(true);
  });

  it("contains: true when field contains value", () => {
    const config: ConditionConfig = { field: "n1.result", operator: "contains", value: "auth" };
    expect(evaluateCondition(config, context)).toBe(true);
  });

  it("contains: false when field does not contain value", () => {
    const config: ConditionConfig = { field: "n1.result", operator: "contains", value: "database" };
    expect(evaluateCondition(config, context)).toBe(false);
  });

  it("not_contains: true when field does not contain value", () => {
    const config: ConditionConfig = { field: "n1.result", operator: "not_contains", value: "database" };
    expect(evaluateCondition(config, context)).toBe(true);
  });

  it("is_empty: true for empty string", () => {
    const config: ConditionConfig = { field: "n2.result", operator: "is_empty" };
    expect(evaluateCondition(config, context)).toBe(true);
  });

  it("is_empty: false for non-empty string", () => {
    const config: ConditionConfig = { field: "n1.result", operator: "is_empty" };
    expect(evaluateCondition(config, context)).toBe(false);
  });

  it("not_empty: true for non-empty string", () => {
    const config: ConditionConfig = { field: "n1.result", operator: "not_empty" };
    expect(evaluateCondition(config, context)).toBe(true);
  });

  it("is_empty: true for missing field", () => {
    const config: ConditionConfig = { field: "n1.nonexistent", operator: "is_empty" };
    expect(evaluateCondition(config, context)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/relay/tests/workflow-condition.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/relay/src/workflow-condition.ts
import type { ConditionConfig, WorkflowContext } from "./workflow-types.js";

/**
 * Resolves a dot-notation path (with bracket array access) against the workflow context.
 * Example: "n1.artifacts[0].parts[0].text"
 */
export function resolveContextValue(
  context: WorkflowContext,
  path: string
): string | undefined {
  // Split "n1.artifacts[0].parts[0].text" into segments: ["n1", "artifacts", "0", "parts", "0", "text"]
  const segments = path.replace(/\[(\d+)\]/g, ".$1").split(".");

  let current: unknown = context;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }

  if (current === null || current === undefined) return undefined;
  return String(current);
}

/**
 * Evaluates a condition config against the workflow context.
 * All comparisons are string-based in v1.
 */
export function evaluateCondition(
  config: ConditionConfig,
  context: WorkflowContext
): boolean {
  const resolved = resolveContextValue(context, config.field);
  const fieldValue = resolved ?? "";

  switch (config.operator) {
    case "equals":
      return fieldValue === (config.value ?? "");
    case "not_equals":
      return fieldValue !== (config.value ?? "");
    case "contains":
      return fieldValue.includes(config.value ?? "");
    case "not_contains":
      return !fieldValue.includes(config.value ?? "");
    case "is_empty":
      return fieldValue === "";
    case "not_empty":
      return fieldValue !== "";
    default:
      return false;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/relay/tests/workflow-condition.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/workflow-condition.ts packages/relay/tests/workflow-condition.test.ts
git commit -m "feat(relay): add condition evaluator with dot-notation context resolution"
```

---

### Task 5: Template Resolution and Data Mapping Utility

**Files:**
- Modify: `packages/relay/src/workflow-condition.ts` (add `resolveTemplate` and `applyDataMapping`)
- Modify: `packages/relay/tests/workflow-condition.test.ts` (add tests)

- [ ] **Step 1: Write the failing tests**

Append to `packages/relay/tests/workflow-condition.test.ts`:

```typescript
import { resolveTemplate, applyDataMapping } from "../src/workflow-condition.js";
import type { DataMapping, WorkflowContext, NodeOutput } from "../src/workflow-types.js";

describe("resolveTemplate", () => {
  it("should replace placeholders with context values", () => {
    const data: Record<string, string> = { bugDescription: "null pointer in auth", agentName: "claude-code" };
    const template = "Fix this bug: {{bugDescription}} (assigned to {{agentName}})";
    expect(resolveTemplate(template, data)).toBe("Fix this bug: null pointer in auth (assigned to claude-code)");
  });

  it("should leave unresolved placeholders empty", () => {
    const data: Record<string, string> = {};
    expect(resolveTemplate("Hello {{name}}", data)).toBe("Hello ");
  });

  it("should handle templates with no placeholders", () => {
    expect(resolveTemplate("plain text", {})).toBe("plain text");
  });
});

describe("applyDataMapping", () => {
  it("should map source node fields to target data keys", () => {
    const sourceOutput: NodeOutput = {
      status: "completed",
      result: "the bug report",
      artifacts: [{ name: "output", parts: [{ type: "text", text: "detailed analysis" }] }],
    };
    const mapping: DataMapping = {
      "result": "bugDescription",
      "artifacts[0].parts[0].text": "analysis",
    };
    const mapped = applyDataMapping(sourceOutput, mapping);
    expect(mapped).toEqual({
      bugDescription: "the bug report",
      analysis: "detailed analysis",
    });
  });

  it("should skip mappings that resolve to undefined", () => {
    const sourceOutput: NodeOutput = { status: "completed" };
    const mapping: DataMapping = { "result": "bugDescription" };
    const mapped = applyDataMapping(sourceOutput, mapping);
    expect(mapped).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/relay/tests/workflow-condition.test.ts`
Expected: FAIL with "resolveTemplate is not exported"

- [ ] **Step 3: Write minimal implementation**

Add to `packages/relay/src/workflow-condition.ts`:

```typescript
import type { ConditionConfig, WorkflowContext, DataMapping, NodeOutput } from "./workflow-types.js";

/**
 * Resolves a dot-notation path against a single node output object.
 */
function resolveObjectPath(obj: unknown, path: string): string | undefined {
  const segments = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  if (current === null || current === undefined) return undefined;
  return String(current);
}

/**
 * Replaces {{variableName}} placeholders in a template string with values from data map.
 */
export function resolveTemplate(
  template: string,
  data: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return data[key] ?? "";
  });
}

/**
 * Applies edge data mapping: extracts fields from a source node's output
 * and returns a flat key-value map for the target node.
 */
export function applyDataMapping(
  sourceOutput: NodeOutput,
  mapping: DataMapping
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [sourcePath, targetKey] of Object.entries(mapping)) {
    const value = resolveObjectPath(sourceOutput, sourcePath);
    if (value !== undefined) {
      result[targetKey] = value;
    }
  }
  return result;
}
```

Note: Refactor `resolveContextValue` to use the shared `resolveObjectPath` helper internally. The `resolveContextValue` function splits at the first dot to get the node ID, then delegates to `resolveObjectPath` on the node output:

```typescript
export function resolveContextValue(
  context: WorkflowContext,
  path: string
): string | undefined {
  const dotIndex = path.indexOf(".");
  if (dotIndex === -1) return undefined;
  const nodeId = path.slice(0, dotIndex);
  const rest = path.slice(dotIndex + 1);
  const nodeOutput = context[nodeId];
  if (!nodeOutput) return undefined;
  return resolveObjectPath(nodeOutput, rest);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/relay/tests/workflow-condition.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/workflow-condition.ts packages/relay/tests/workflow-condition.test.ts
git commit -m "feat(relay): add template resolution and edge data mapping utilities"
```

---

### Task 6: Workflow Engine — Linear Execution

**Files:**
- Create: `packages/relay/src/workflow-engine.ts`
- Create: `packages/relay/tests/workflow-engine.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/workflow-engine.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWorkflowEngine } from "../src/workflow-engine.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import type { LatticeDB } from "../src/db.js";
import type { LatticeEventBus } from "../src/event-bus.js";
import type { LatticeTaskManager } from "../src/task-manager.js";
import type { Task } from "@lattice/adapter-base";
import type { WorkflowDefinition } from "../src/workflow-types.js";

function createMockTaskManager(): LatticeTaskManager {
  let taskCounter = 0;
  return {
    createTask: vi.fn().mockImplementation(async (text: string): Promise<Task> => {
      taskCounter++;
      return {
        id: `task-${taskCounter}`,
        status: "submitted",
        artifacts: [],
        history: [{ role: "user", parts: [{ type: "text", text }] }],
        metadata: { createdAt: "", updatedAt: "", assignedAgent: "", routingReason: "", latencyMs: 0 },
      };
    }),
    executeTask: vi.fn().mockImplementation(async (taskId: string): Promise<Task> => ({
      id: taskId,
      status: "completed",
      artifacts: [{ name: "output", parts: [{ type: "text", text: `result from ${taskId}` }] }],
      history: [],
      metadata: { createdAt: "", updatedAt: "", assignedAgent: "mock-agent", routingReason: "", latencyMs: 100 },
    })),
    getTask: vi.fn(),
    listTasks: vi.fn().mockReturnValue([]),
    cancelTask: vi.fn(),
    provideInput: vi.fn(),
  };
}

describe("WorkflowEngine", () => {
  let db: LatticeDB;
  let bus: LatticeEventBus;
  let taskManager: LatticeTaskManager;

  beforeEach(() => {
    db = createDatabase(":memory:");
    bus = createEventBus();
    taskManager = createMockTaskManager();
  });

  it("should execute a single-node workflow", async () => {
    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [{ id: "n1", type: "agent-task", label: "Step 1", config: { agent: "auto", taskTemplate: "do the thing" } }],
      edges: [],
    };
    db.insertWorkflow("wf-1", "Single Step", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-1");

    expect(run.status).toBe("completed");
    expect(taskManager.createTask).toHaveBeenCalledOnce();
    expect(taskManager.executeTask).toHaveBeenCalledOnce();
  });

  it("should execute a linear chain in order", async () => {
    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "n1", type: "agent-task", label: "Step 1", config: { agent: "auto", taskTemplate: "first" } },
        { id: "n2", type: "agent-task", label: "Step 2", config: { agent: "auto", taskTemplate: "second" } },
        { id: "n3", type: "agent-task", label: "Step 3", config: { agent: "auto", taskTemplate: "third" } },
      ],
      edges: [
        { source: "n1", target: "n2" },
        { source: "n2", target: "n3" },
      ],
    };
    db.insertWorkflow("wf-2", "Chain", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-2");

    expect(run.status).toBe("completed");
    expect(taskManager.createTask).toHaveBeenCalledTimes(3);
    // Verify order via call sequence
    const createCalls = (taskManager.createTask as ReturnType<typeof vi.fn>).mock.calls;
    expect(createCalls[0][0]).toBe("first");
    expect(createCalls[1][0]).toBe("second");
    expect(createCalls[2][0]).toBe("third");
  });

  it("should emit workflow:started and workflow:completed events", async () => {
    const startedHandler = vi.fn();
    const completedHandler = vi.fn();
    bus.on("workflow:started", startedHandler);
    bus.on("workflow:completed", completedHandler);

    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [{ id: "n1", type: "agent-task", label: "Step 1", config: { agent: "auto", taskTemplate: "do it" } }],
      edges: [],
    };
    db.insertWorkflow("wf-1", "Test", definition as unknown as Record<string, unknown>);

    await engine.runWorkflow("wf-1");

    expect(startedHandler).toHaveBeenCalledOnce();
    expect(completedHandler).toHaveBeenCalledOnce();
  });

  it("should emit workflow:step events for each node", async () => {
    const stepHandler = vi.fn();
    bus.on("workflow:step", stepHandler);

    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "n1", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "A" } },
        { id: "n2", type: "agent-task", label: "B", config: { agent: "auto", taskTemplate: "B" } },
      ],
      edges: [{ source: "n1", target: "n2" }],
    };
    db.insertWorkflow("wf-1", "Test", definition as unknown as Record<string, unknown>);

    await engine.runWorkflow("wf-1");

    // Each node emits two step events: "working" and "completed"
    expect(stepHandler).toHaveBeenCalledTimes(4);
  });

  it("should persist workflow run in database", async () => {
    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [{ id: "n1", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "A" } }],
      edges: [],
    };
    db.insertWorkflow("wf-1", "Test", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-1");

    const dbRun = db.getWorkflowRun(run.id);
    expect(dbRun).toBeDefined();
    expect(dbRun!.status).toBe("completed");
    expect(dbRun!.completed_at).toBeDefined();
  });

  it("should throw for non-existent workflow", async () => {
    const engine = createWorkflowEngine(db, taskManager, bus);
    await expect(engine.runWorkflow("nonexistent")).rejects.toThrow("Workflow \"nonexistent\" not found");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/relay/tests/workflow-engine.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```typescript
// packages/relay/src/workflow-engine.ts
import { v4 as uuidv4 } from "uuid";
import type { LatticeDB, WorkflowRunRow } from "./db.js";
import type { LatticeTaskManager } from "./task-manager.js";
import type { LatticeEventBus } from "./event-bus.js";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowContext,
  NodeOutput,
  AgentTaskConfig,
} from "./workflow-types.js";
import { topoSort } from "./workflow-topo.js";
import { resolveTemplate, applyDataMapping } from "./workflow-condition.js";

export interface WorkflowRunResult {
  id: string;
  workflowId: string;
  status: "completed" | "failed";
  context: WorkflowContext;
}

export interface LatticeWorkflowEngine {
  runWorkflow(workflowId: string): Promise<WorkflowRunResult>;
}

export function createWorkflowEngine(
  db: LatticeDB,
  taskManager: LatticeTaskManager,
  eventBus: LatticeEventBus
): LatticeWorkflowEngine {
  async function executeNode(
    node: WorkflowNode,
    context: WorkflowContext,
    runId: string,
    def: WorkflowDefinition
  ): Promise<NodeOutput> {
    eventBus.emit({ type: "workflow:step", runId, stepId: node.id, status: "working" });

    if (node.type === "agent-task") {
      const config = node.config as AgentTaskConfig;

      // Collect mapped data from all incoming edges
      const incomingEdges = def.edges.filter((e) => e.target === node.id);
      const mappedData: Record<string, string> = {};
      for (const edge of incomingEdges) {
        const sourceOutput = context[edge.source];
        if (sourceOutput && edge.dataMapping) {
          Object.assign(mappedData, applyDataMapping(sourceOutput, edge.dataMapping));
        }
      }

      // Resolve template
      const taskText = resolveTemplate(config.taskTemplate, mappedData);

      // Create and execute a real task
      const agent = config.agent === "auto" ? undefined : config.agent;
      const task = await taskManager.createTask(taskText, agent);
      const result = await taskManager.executeTask(task.id);

      const output: NodeOutput = {
        status: result.status === "completed" ? "completed" : "failed",
        result: result.artifacts?.[0]?.parts?.[0]?.text ?? "",
        artifacts: result.artifacts,
        data: mappedData,
      };

      eventBus.emit({ type: "workflow:step", runId, stepId: node.id, status: output.status });
      return output;
    }

    // Condition nodes handled in Task 7
    return { status: "completed" };
  }

  return {
    async runWorkflow(workflowId: string): Promise<WorkflowRunResult> {
      const wfRow = db.getWorkflow(workflowId);
      if (!wfRow) throw new Error(`Workflow "${workflowId}" not found`);

      const def = JSON.parse(wfRow.definition) as WorkflowDefinition;
      const runId = uuidv4();

      db.insertWorkflowRun(runId, workflowId);
      db.updateWorkflowRun(runId, { status: "running" });
      eventBus.emit({ type: "workflow:started", runId, workflowId });

      const context: WorkflowContext = {};
      const nodeMap = new Map(def.nodes.map((n) => [n.id, n]));
      const layers = topoSort(def);

      let failed = false;

      for (const layer of layers) {
        const results = await Promise.all(
          layer.map(async (nodeId) => {
            const node = nodeMap.get(nodeId)!;
            try {
              const output = await executeNode(node, context, runId, def);
              context[nodeId] = output;
            } catch (err) {
              context[nodeId] = {
                status: "failed",
                result: err instanceof Error ? err.message : String(err),
              };
              failed = true;
            }
          })
        );
      }

      const finalStatus = failed ? "failed" : "completed";
      db.updateWorkflowRun(runId, { status: finalStatus, context: context as unknown as Record<string, unknown> });
      eventBus.emit({ type: "workflow:completed", runId });

      return { id: runId, workflowId, status: finalStatus, context };
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/relay/tests/workflow-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/workflow-engine.ts packages/relay/tests/workflow-engine.test.ts
git commit -m "feat(relay): add workflow engine with linear and parallel DAG execution"
```

---

### Task 7: Workflow Engine — Parallel Branches and Condition Nodes

**Files:**
- Modify: `packages/relay/src/workflow-engine.ts`
- Modify: `packages/relay/tests/workflow-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `packages/relay/tests/workflow-engine.test.ts`:

```typescript
  it("should execute parallel branches concurrently", async () => {
    const callOrder: string[] = [];
    (taskManager.createTask as ReturnType<typeof vi.fn>).mockImplementation(async (text: string) => {
      callOrder.push(`create:${text}`);
      return {
        id: `task-${text}`,
        status: "submitted",
        artifacts: [],
        history: [{ role: "user", parts: [{ type: "text", text }] }],
        metadata: { createdAt: "", updatedAt: "", assignedAgent: "", routingReason: "", latencyMs: 0 },
      };
    });
    (taskManager.executeTask as ReturnType<typeof vi.fn>).mockImplementation(async (taskId: string) => ({
      id: taskId,
      status: "completed",
      artifacts: [{ name: "output", parts: [{ type: "text", text: `done-${taskId}` }] }],
      history: [],
      metadata: { createdAt: "", updatedAt: "", assignedAgent: "mock", routingReason: "", latencyMs: 50 },
    }));

    const engine = createWorkflowEngine(db, taskManager, bus);
    // a -> b, a -> c, b -> d, c -> d (diamond)
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "a", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "A" } },
        { id: "b", type: "agent-task", label: "B", config: { agent: "auto", taskTemplate: "B" } },
        { id: "c", type: "agent-task", label: "C", config: { agent: "auto", taskTemplate: "C" } },
        { id: "d", type: "agent-task", label: "D", config: { agent: "auto", taskTemplate: "D" } },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
        { source: "b", target: "d" },
        { source: "c", target: "d" },
      ],
    };
    db.insertWorkflow("wf-d", "Diamond", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-d");

    expect(run.status).toBe("completed");
    // A must be first; B and C in any order; D last
    expect(callOrder[0]).toBe("create:A");
    expect(callOrder[3]).toBe("create:D");
    expect(taskManager.createTask).toHaveBeenCalledTimes(4);
  });

  it("should handle condition nodes — true branch proceeds", async () => {
    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "n1", type: "agent-task", label: "Analyze", config: { agent: "auto", taskTemplate: "analyze bug" } },
        { id: "cond", type: "condition", label: "Is completed?", config: { field: "n1.status", operator: "equals", value: "completed" } },
        { id: "n2", type: "agent-task", label: "Fix", config: { agent: "auto", taskTemplate: "fix it" } },
      ],
      edges: [
        { source: "n1", target: "cond" },
        { source: "cond", target: "n2" },
      ],
    };
    db.insertWorkflow("wf-cond", "Conditional", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-cond");

    expect(run.status).toBe("completed");
    expect(run.context["cond"].conditionResult).toBe(true);
    // n2 should have executed
    expect(run.context["n2"].status).toBe("completed");
  });

  it("should skip downstream nodes when condition is false", async () => {
    (taskManager.executeTask as ReturnType<typeof vi.fn>).mockImplementation(async (taskId: string) => ({
      id: taskId,
      status: "failed",
      artifacts: [],
      history: [],
      metadata: { createdAt: "", updatedAt: "", assignedAgent: "mock", routingReason: "", latencyMs: 100 },
    }));

    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "n1", type: "agent-task", label: "Analyze", config: { agent: "auto", taskTemplate: "analyze bug" } },
        { id: "cond", type: "condition", label: "Is completed?", config: { field: "n1.status", operator: "equals", value: "completed" } },
        { id: "n2", type: "agent-task", label: "Fix", config: { agent: "auto", taskTemplate: "fix it" } },
      ],
      edges: [
        { source: "n1", target: "cond" },
        { source: "cond", target: "n2" },
      ],
    };
    db.insertWorkflow("wf-cond-f", "Cond False", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-cond-f");

    expect(run.context["cond"].conditionResult).toBe(false);
    expect(run.context["n2"].status).toBe("skipped");
    // createTask should only be called once (for n1, not n2)
    expect(taskManager.createTask).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/relay/tests/workflow-engine.test.ts`
Expected: FAIL — condition node tests fail (condition logic not yet wired into engine)

- [ ] **Step 3: Write minimal implementation**

Update `executeNode` in `packages/relay/src/workflow-engine.ts` to handle condition nodes and track skipped nodes:

```typescript
import { evaluateCondition } from "./workflow-condition.js";
import type { ConditionConfig } from "./workflow-types.js";
```

In `executeNode`, add the condition branch:

```typescript
    if (node.type === "condition") {
      const config = node.config as ConditionConfig;
      const result = evaluateCondition(config, context);
      const output: NodeOutput = {
        status: "completed",
        conditionResult: result,
      };
      eventBus.emit({ type: "workflow:step", runId, stepId: node.id, status: "completed" });
      return output;
    }
```

In the main `runWorkflow` loop, before executing a node, check if any upstream condition node evaluated to `false`. If so, skip the node:

```typescript
      for (const layer of layers) {
        await Promise.all(
          layer.map(async (nodeId) => {
            const node = nodeMap.get(nodeId)!;

            // Check if this node should be skipped (upstream condition was false)
            const incomingEdges = def.edges.filter((e) => e.target === nodeId);
            const shouldSkip = incomingEdges.some((edge) => {
              const sourceOutput = context[edge.source];
              if (!sourceOutput) return true; // source didn't run
              if (sourceOutput.status === "skipped") return true;
              if (sourceOutput.conditionResult === false) return true;
              return false;
            });

            if (shouldSkip) {
              context[nodeId] = { status: "skipped" };
              eventBus.emit({ type: "workflow:step", runId, stepId: nodeId, status: "skipped" });
              return;
            }

            try {
              const output = await executeNode(node, context, runId, def);
              context[nodeId] = output;
            } catch (err) {
              context[nodeId] = {
                status: "failed",
                result: err instanceof Error ? err.message : String(err),
              };
              failed = true;
            }
          })
        );
      }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/relay/tests/workflow-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/workflow-engine.ts packages/relay/tests/workflow-engine.test.ts
git commit -m "feat(relay): add condition nodes and skip logic to workflow engine"
```

---

### Task 8: Workflow Engine — Data Mapping Between Nodes

**Files:**
- Modify: `packages/relay/tests/workflow-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/relay/tests/workflow-engine.test.ts`:

```typescript
  it("should resolve task templates using edge data mappings", async () => {
    let capturedTexts: string[] = [];
    (taskManager.createTask as ReturnType<typeof vi.fn>).mockImplementation(async (text: string) => {
      capturedTexts.push(text);
      return {
        id: `task-${capturedTexts.length}`,
        status: "submitted",
        artifacts: [],
        history: [{ role: "user", parts: [{ type: "text", text }] }],
        metadata: { createdAt: "", updatedAt: "", assignedAgent: "", routingReason: "", latencyMs: 0 },
      };
    });
    (taskManager.executeTask as ReturnType<typeof vi.fn>).mockImplementation(async (taskId: string) => ({
      id: taskId,
      status: "completed",
      artifacts: [{ name: "output", parts: [{ type: "text", text: "Bug is in auth module line 42" }] }],
      history: [],
      metadata: { createdAt: "", updatedAt: "", assignedAgent: "mock", routingReason: "", latencyMs: 50 },
    }));

    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [
        { id: "n1", type: "agent-task", label: "Analyze", config: { agent: "auto", taskTemplate: "analyze the bug" } },
        { id: "n2", type: "agent-task", label: "Fix", config: { agent: "auto", taskTemplate: "Fix this: {{bugReport}}" } },
      ],
      edges: [
        { source: "n1", target: "n2", dataMapping: { "artifacts[0].parts[0].text": "bugReport" } },
      ],
    };
    db.insertWorkflow("wf-map", "Mapped", definition as unknown as Record<string, unknown>);

    await engine.runWorkflow("wf-map");

    expect(capturedTexts[0]).toBe("analyze the bug");
    expect(capturedTexts[1]).toBe("Fix this: Bug is in auth module line 42");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/relay/tests/workflow-engine.test.ts`
Expected: FAIL — the template should not resolve because data mapping was already implemented in Task 6, so this test should actually PASS. If it does, this confirms the implementation is correct. If it fails, debug the data mapping path.

- [ ] **Step 3: Verify implementation handles edge data mapping**

The data mapping logic was already included in the `executeNode` function in Task 6. This test validates that the full pipeline (edge mapping + template resolution) works end-to-end. No new code should be needed.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/relay/tests/workflow-engine.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/relay/tests/workflow-engine.test.ts
git commit -m "test(relay): add data mapping integration test for workflow engine"
```

---

### Task 9: Workflow Engine — Failure Handling

**Files:**
- Modify: `packages/relay/tests/workflow-engine.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `packages/relay/tests/workflow-engine.test.ts`:

```typescript
  it("should mark run as failed when a task throws", async () => {
    (taskManager.executeTask as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("adapter crashed"));

    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [{ id: "n1", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "A" } }],
      edges: [],
    };
    db.insertWorkflow("wf-fail", "Fail", definition as unknown as Record<string, unknown>);

    const run = await engine.runWorkflow("wf-fail");

    expect(run.status).toBe("failed");
    expect(run.context["n1"].status).toBe("failed");
    expect(run.context["n1"].result).toContain("adapter crashed");

    const dbRun = db.getWorkflowRun(run.id);
    expect(dbRun!.status).toBe("failed");
  });

  it("should route to explicit agent when config.agent is not auto", async () => {
    const engine = createWorkflowEngine(db, taskManager, bus);
    const definition: WorkflowDefinition = {
      nodes: [{ id: "n1", type: "agent-task", label: "A", config: { agent: "claude-code", taskTemplate: "fix it" } }],
      edges: [],
    };
    db.insertWorkflow("wf-explicit", "Explicit Agent", definition as unknown as Record<string, unknown>);

    await engine.runWorkflow("wf-explicit");

    expect(taskManager.createTask).toHaveBeenCalledWith("fix it", "claude-code");
  });
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run packages/relay/tests/workflow-engine.test.ts`
Expected: PASS — the failure handling was already implemented in Task 6's `try/catch`. The explicit agent test validates the `config.agent !== "auto"` path. If either fails, fix the engine accordingly.

- [ ] **Step 3: Commit**

```bash
git add packages/relay/tests/workflow-engine.test.ts
git commit -m "test(relay): add failure handling and explicit agent tests for workflow engine"
```

---

### Task 10: Workflow API Routes

**Files:**
- Modify: `packages/relay/src/server.ts`
- Create: `packages/relay/tests/workflow-api.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// packages/relay/tests/workflow-api.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/server.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import { createRegistry } from "../src/registry.js";
import { createRouter } from "../src/router.js";
import { createTaskManager } from "../src/task-manager.js";
import { createWorkflowEngine } from "../src/workflow-engine.js";
import type { LatticeAdapter, AgentCard, Task } from "@lattice/adapter-base";

function createMockAdapter(name: string): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "s1", name: "Skill", description: "skill", tags: ["code"] }],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn().mockImplementation(async (task: Task) => ({
      ...task,
      status: "completed",
      artifacts: [{ name: "output", parts: [{ type: "text", text: "done" }] }],
    })),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("Workflow API", () => {
  let app: ReturnType<typeof createApp>;
  let db: ReturnType<typeof createDatabase>;

  beforeEach(() => {
    db = createDatabase(":memory:");
    const bus = createEventBus();
    const registry = createRegistry(db, bus);
    const router = createRouter(registry);
    const taskManager = createTaskManager(db, bus, registry, router);
    const workflowEngine = createWorkflowEngine(db, taskManager, bus);
    registry.register(createMockAdapter("claude-code"));
    app = createApp({ db, registry, taskManager, bus, workflowEngine });
  });

  it("POST /api/workflows — should create a workflow", async () => {
    const res = await request(app)
      .post("/api/workflows")
      .send({
        name: "Test Workflow",
        definition: {
          nodes: [{ id: "n1", type: "agent-task", label: "Step 1", config: { agent: "auto", taskTemplate: "do it" } }],
          edges: [],
        },
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("Test Workflow");
  });

  it("GET /api/workflows — should list workflows", async () => {
    await request(app).post("/api/workflows").send({
      name: "WF1",
      definition: { nodes: [], edges: [] },
    });
    await request(app).post("/api/workflows").send({
      name: "WF2",
      definition: { nodes: [], edges: [] },
    });

    const res = await request(app).get("/api/workflows");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("POST /api/workflows/:id/run — should run a workflow and return run result", async () => {
    const createRes = await request(app).post("/api/workflows").send({
      name: "Runnable",
      definition: {
        nodes: [{ id: "n1", type: "agent-task", label: "Step", config: { agent: "auto", taskTemplate: "fix the code" } }],
        edges: [],
      },
    });
    const workflowId = createRes.body.id;

    const runRes = await request(app).post(`/api/workflows/${workflowId}/run`);
    expect(runRes.status).toBe(200);
    expect(runRes.body.status).toBe("completed");
    expect(runRes.body.workflowId).toBe(workflowId);
  });

  it("GET /api/workflows/:id/runs — should list runs for a workflow", async () => {
    const createRes = await request(app).post("/api/workflows").send({
      name: "Multi-run",
      definition: {
        nodes: [{ id: "n1", type: "agent-task", label: "Step", config: { agent: "auto", taskTemplate: "do" } }],
        edges: [],
      },
    });
    const workflowId = createRes.body.id;

    await request(app).post(`/api/workflows/${workflowId}/run`);
    await request(app).post(`/api/workflows/${workflowId}/run`);

    const runsRes = await request(app).get(`/api/workflows/${workflowId}/runs`);
    expect(runsRes.status).toBe(200);
    expect(runsRes.body).toHaveLength(2);
  });

  it("POST /api/workflows — should return 400 without name", async () => {
    const res = await request(app).post("/api/workflows").send({ definition: { nodes: [], edges: [] } });
    expect(res.status).toBe(400);
  });

  it("POST /api/workflows/:id/run — should return 404 for missing workflow", async () => {
    const res = await request(app).post("/api/workflows/nonexistent/run");
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/relay/tests/workflow-api.test.ts`
Expected: FAIL — routes don't exist yet, 404 on all endpoints

- [ ] **Step 3: Write minimal implementation**

Update `packages/relay/src/server.ts`:

Add `LatticeWorkflowEngine` import and update `ServerDeps`:

```typescript
import type { LatticeWorkflowEngine } from "./workflow-engine.js";
import { v4 as uuidv4 } from "uuid";

interface ServerDeps {
  db: LatticeDB;
  registry: LatticeRegistry;
  taskManager: LatticeTaskManager;
  bus: LatticeEventBus;
  workflowEngine?: LatticeWorkflowEngine;
}
```

Update the `createApp` function signature to destructure `workflowEngine`:

```typescript
export function createApp({ db, registry, taskManager, bus, workflowEngine }: ServerDeps) {
```

Add routes before the `return app` line:

```typescript
  // --- Workflow routes ---
  app.get("/api/workflows", (_req, res) => {
    const workflows = db.listWorkflows();
    res.json(workflows.map((w) => ({ ...w, definition: JSON.parse(w.definition) })));
  });

  app.post("/api/workflows", (req, res) => {
    const { name, definition } = req.body;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    if (!definition) { res.status(400).json({ error: "definition is required" }); return; }
    const id = uuidv4();
    db.insertWorkflow(id, name, definition);
    res.status(201).json({ id, name, definition });
  });

  app.post("/api/workflows/:id/run", async (req, res) => {
    try {
      if (!workflowEngine) { res.status(500).json({ error: "Workflow engine not configured" }); return; }
      const wf = db.getWorkflow(req.params.id);
      if (!wf) { res.status(404).json({ error: "Workflow not found" }); return; }
      const result = await workflowEngine.runWorkflow(req.params.id);
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  app.get("/api/workflows/:id/runs", (req, res) => {
    const runs = db.listWorkflowRuns(req.params.id);
    res.json(runs.map((r) => ({ ...r, context: r.context ? JSON.parse(r.context) : null })));
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run packages/relay/tests/workflow-api.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/relay/src/server.ts packages/relay/tests/workflow-api.test.ts
git commit -m "feat(relay): add workflow API routes (create, list, run, list runs)"
```

---

### Task 11: Re-exports and Index Update

**Files:**
- Modify: `packages/relay/src/index.ts`

- [ ] **Step 1: Update index.ts to re-export workflow modules**

Add the following exports to `packages/relay/src/index.ts`:

```typescript
export { createWorkflowEngine } from "./workflow-engine.js";
export type { LatticeWorkflowEngine, WorkflowRunResult } from "./workflow-engine.js";
export { topoSort } from "./workflow-topo.js";
export { evaluateCondition, resolveContextValue, resolveTemplate, applyDataMapping } from "./workflow-condition.js";
export type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
  WorkflowContext,
  NodeOutput,
  AgentTaskConfig,
  ConditionConfig,
  DataMapping,
} from "./workflow-types.js";
```

- [ ] **Step 2: Run all tests to confirm nothing is broken**

Run: `npx vitest run`
Expected: All tests PASS (existing 45 + new workflow tests)

- [ ] **Step 3: Commit**

```bash
git add packages/relay/src/index.ts
git commit -m "feat(relay): re-export workflow engine modules from index"
```

---

### Task 12: Demo Workflows

**Files:**
- Create: `workflows/bug-fix-pipeline.json`
- Create: `workflows/code-review.json`

- [ ] **Step 1: Create Bug Fix Pipeline workflow**

```json
// workflows/bug-fix-pipeline.json
{
  "name": "Bug Fix Pipeline",
  "description": "Describe a bug, Claude Code fixes it, Codex reviews the fix, OpenClaw notifies the team.",
  "definition": {
    "nodes": [
      {
        "id": "describe",
        "type": "agent-task",
        "label": "Describe Bug",
        "config": {
          "agent": "auto",
          "taskTemplate": "{{bugDescription}}"
        }
      },
      {
        "id": "fix",
        "type": "agent-task",
        "label": "Fix Bug",
        "config": {
          "agent": "claude-code",
          "taskTemplate": "Fix this bug: {{bugReport}}"
        }
      },
      {
        "id": "review",
        "type": "agent-task",
        "label": "Review Fix",
        "config": {
          "agent": "codex",
          "taskTemplate": "Review this fix for correctness and style:\n\n{{fixOutput}}"
        }
      },
      {
        "id": "check-review",
        "type": "condition",
        "label": "Review Passed?",
        "config": {
          "field": "review.status",
          "operator": "equals",
          "value": "completed"
        }
      },
      {
        "id": "notify",
        "type": "agent-task",
        "label": "Notify Team",
        "config": {
          "agent": "openclaw",
          "taskTemplate": "Bug fix completed and reviewed. Summary:\n\nBug: {{bugReport}}\nFix: {{fixOutput}}\nReview: {{reviewOutput}}"
        }
      }
    ],
    "edges": [
      {
        "source": "describe",
        "target": "fix",
        "dataMapping": {
          "artifacts[0].parts[0].text": "bugReport"
        }
      },
      {
        "source": "fix",
        "target": "review",
        "dataMapping": {
          "artifacts[0].parts[0].text": "fixOutput"
        }
      },
      {
        "source": "review",
        "target": "check-review"
      },
      {
        "source": "check-review",
        "target": "notify"
      },
      {
        "source": "describe",
        "target": "notify",
        "dataMapping": {
          "artifacts[0].parts[0].text": "bugReport"
        }
      },
      {
        "source": "fix",
        "target": "notify",
        "dataMapping": {
          "artifacts[0].parts[0].text": "fixOutput"
        }
      },
      {
        "source": "review",
        "target": "notify",
        "dataMapping": {
          "artifacts[0].parts[0].text": "reviewOutput"
        }
      }
    ]
  }
}
```

- [ ] **Step 2: Create Code Review workflow**

```json
// workflows/code-review.json
{
  "name": "Code Review",
  "description": "Point to a PR, Claude Code reviews the code, OpenClaw sends a summary to the team.",
  "definition": {
    "nodes": [
      {
        "id": "review",
        "type": "agent-task",
        "label": "Review Code",
        "config": {
          "agent": "claude-code",
          "taskTemplate": "{{prDescription}}"
        }
      },
      {
        "id": "summarize",
        "type": "agent-task",
        "label": "Send Summary",
        "config": {
          "agent": "openclaw",
          "taskTemplate": "Code review completed. Summary of findings:\n\n{{reviewFindings}}"
        }
      }
    ],
    "edges": [
      {
        "source": "review",
        "target": "summarize",
        "dataMapping": {
          "artifacts[0].parts[0].text": "reviewFindings"
        }
      }
    ]
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add workflows/
git commit -m "feat(workflows): add bug-fix-pipeline and code-review demo workflows"
```
