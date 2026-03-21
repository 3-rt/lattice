import Database from "better-sqlite3";
import type { AgentCard, Message } from "@lattice/adapter-base";

// Row types matching SQLite columns
export interface AgentRow {
  name: string;
  agent_card: string; // JSON serialized AgentCard
  status: string;
  last_heartbeat: string;
  registered_at: string;
}

export interface TaskRow {
  id: string;
  status: string;
  history: string; // JSON serialized Message[]
  result: string | null; // JSON serialized Artifact[] or {"error":"..."} or null
  assigned_agent: string | null;
  routing_reason: string | null;
  latency_ms: number | null;
  cost: number | null;
  workflow_id: string | null;
  workflow_step_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoutingStatsRow {
  agent_name: string;
  category: string;
  successes: number;
  failures: number;
  total_latency_ms: number;
  total_cost: number;
  updated_at: string;
}

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

export interface TaskFilter {
  status?: string;
  assigned_agent?: string;
}

export interface TaskUpdate {
  status?: string;
  assigned_agent?: string;
  routing_reason?: string;
  result?: string;
  latency_ms?: number;
  cost?: number;
  workflow_id?: string;
  workflow_step_id?: string;
}

export interface LatticeDB {
  // Agent methods
  upsertAgent(name: string, card: AgentCard): void;
  updateAgentStatus(name: string, status: string): void;
  updateAgentHeartbeat(name: string): void;
  deleteAgent(name: string): void;
  listAgents(): AgentRow[];
  getAgent(name: string): AgentRow | undefined;

  // Task methods
  insertTask(id: string, history: Message[]): void;
  getTask(id: string): TaskRow | undefined;
  updateTask(id: string, update: TaskUpdate): void;
  listTasks(filter?: TaskFilter): TaskRow[];
  updateTaskHistory(id: string, history: Message[]): void;

  // Routing stats methods
  updateRoutingStats(
    agentName: string,
    category: string,
    success: boolean,
    latencyMs: number,
    cost: number
  ): void;
  getRoutingStats(): RoutingStatsRow[];

  // Workflow methods
  insertWorkflow(id: string, name: string, definition: Record<string, unknown>): void;
  getWorkflow(id: string): WorkflowRow | undefined;
  listWorkflows(): WorkflowRow[];
  insertWorkflowRun(id: string, workflowId: string): void;
  updateWorkflowRun(id: string, update: WorkflowRunUpdate): void;
  getWorkflowRun(id: string): WorkflowRunRow | undefined;
  listWorkflowRuns(workflowId: string): WorkflowRunRow[];

  close(): void;
}

export function createDatabase(dbPath: string): LatticeDB {
  const sqlite = new Database(dbPath);

  // Enable WAL mode and foreign keys
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // Create tables
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS agents (
      name TEXT PRIMARY KEY,
      agent_card JSON NOT NULL,
      status TEXT NOT NULL DEFAULT 'online',
      last_heartbeat TEXT NOT NULL DEFAULT (datetime('now')),
      registered_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'submitted',
      history JSON NOT NULL,
      result JSON,
      assigned_agent TEXT,
      routing_reason TEXT,
      latency_ms INTEGER,
      cost REAL,
      workflow_id TEXT,
      workflow_step_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS routing_stats (
      agent_name TEXT NOT NULL,
      category TEXT NOT NULL,
      successes INTEGER NOT NULL DEFAULT 0,
      failures INTEGER NOT NULL DEFAULT 0,
      total_latency_ms INTEGER NOT NULL DEFAULT 0,
      total_cost REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (agent_name, category)
    );

    CREATE TABLE IF NOT EXISTS workflows (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      definition JSON NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS workflow_runs (
      id TEXT PRIMARY KEY,
      workflow_id TEXT NOT NULL REFERENCES workflows(id),
      status TEXT NOT NULL DEFAULT 'pending',
      context JSON,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );
  `);

  // Prepared statements
  const stmts = {
    upsertAgent: sqlite.prepare(`
      INSERT INTO agents (name, agent_card, status)
      VALUES (?, ?, 'online')
      ON CONFLICT(name) DO UPDATE SET
        agent_card = excluded.agent_card,
        status = 'online',
        last_heartbeat = datetime('now')
    `),

    updateAgentStatus: sqlite.prepare(`
      UPDATE agents SET status = ?, last_heartbeat = datetime('now')
      WHERE name = ?
    `),

    updateAgentHeartbeat: sqlite.prepare(`
      UPDATE agents SET last_heartbeat = datetime('now') WHERE name = ?
    `),

    deleteAgent: sqlite.prepare(`DELETE FROM agents WHERE name = ?`),

    listAgents: sqlite.prepare(`SELECT * FROM agents`),

    getAgent: sqlite.prepare(`SELECT * FROM agents WHERE name = ?`),

    insertTask: sqlite.prepare(`
      INSERT INTO tasks (id, history, status)
      VALUES (?, ?, 'submitted')
    `),

    getTask: sqlite.prepare(`SELECT * FROM tasks WHERE id = ?`),

    listTasks: sqlite.prepare(`SELECT * FROM tasks`),

    listTasksByStatus: sqlite.prepare(`SELECT * FROM tasks WHERE status = ?`),

    listTasksByAgent: sqlite.prepare(`SELECT * FROM tasks WHERE assigned_agent = ?`),

    listTasksByStatusAndAgent: sqlite.prepare(`
      SELECT * FROM tasks WHERE status = ? AND assigned_agent = ?
    `),

    updateTaskHistory: sqlite.prepare(`
      UPDATE tasks SET history = ?, updated_at = datetime('now') WHERE id = ?
    `),

    upsertRoutingStats: sqlite.prepare(`
      INSERT INTO routing_stats (agent_name, category, successes, failures, total_latency_ms, total_cost)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_name, category) DO UPDATE SET
        successes = successes + excluded.successes,
        failures = failures + excluded.failures,
        total_latency_ms = total_latency_ms + excluded.total_latency_ms,
        total_cost = total_cost + excluded.total_cost,
        updated_at = datetime('now')
    `),

    getRoutingStats: sqlite.prepare(`SELECT * FROM routing_stats`),

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
  };

  // Build a dynamic UPDATE statement for tasks
  function buildUpdateTask(id: string, update: TaskUpdate): void {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (update.status !== undefined) {
      fields.push("status = ?");
      values.push(update.status);
    }
    if (update.assigned_agent !== undefined) {
      fields.push("assigned_agent = ?");
      values.push(update.assigned_agent);
    }
    if (update.routing_reason !== undefined) {
      fields.push("routing_reason = ?");
      values.push(update.routing_reason);
    }
    if (update.result !== undefined) {
      fields.push("result = ?");
      values.push(update.result);
    }
    if (update.latency_ms !== undefined) {
      fields.push("latency_ms = ?");
      values.push(update.latency_ms);
    }
    if (update.cost !== undefined) {
      fields.push("cost = ?");
      values.push(update.cost);
    }
    if (update.workflow_id !== undefined) {
      fields.push("workflow_id = ?");
      values.push(update.workflow_id);
    }
    if (update.workflow_step_id !== undefined) {
      fields.push("workflow_step_id = ?");
      values.push(update.workflow_step_id);
    }

    if (fields.length === 0) return;

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const sql = `UPDATE tasks SET ${fields.join(", ")} WHERE id = ?`;
    sqlite.prepare(sql).run(...values);
  }

  return {
    upsertAgent(name: string, card: AgentCard): void {
      stmts.upsertAgent.run(name, JSON.stringify(card));
    },

    updateAgentStatus(name: string, status: string): void {
      stmts.updateAgentStatus.run(status, name);
    },

    updateAgentHeartbeat(name: string): void {
      stmts.updateAgentHeartbeat.run(name);
    },

    deleteAgent(name: string): void {
      stmts.deleteAgent.run(name);
    },

    listAgents(): AgentRow[] {
      return stmts.listAgents.all() as AgentRow[];
    },

    getAgent(name: string): AgentRow | undefined {
      return stmts.getAgent.get(name) as AgentRow | undefined;
    },

    insertTask(id: string, history: Message[]): void {
      stmts.insertTask.run(id, JSON.stringify(history));
    },

    getTask(id: string): TaskRow | undefined {
      return stmts.getTask.get(id) as TaskRow | undefined;
    },

    updateTask(id: string, update: TaskUpdate): void {
      buildUpdateTask(id, update);
    },

    listTasks(filter?: TaskFilter): TaskRow[] {
      if (!filter) {
        return stmts.listTasks.all() as TaskRow[];
      }
      if (filter.status && filter.assigned_agent) {
        return stmts.listTasksByStatusAndAgent.all(
          filter.status,
          filter.assigned_agent
        ) as TaskRow[];
      }
      if (filter.status) {
        return stmts.listTasksByStatus.all(filter.status) as TaskRow[];
      }
      if (filter.assigned_agent) {
        return stmts.listTasksByAgent.all(filter.assigned_agent) as TaskRow[];
      }
      return stmts.listTasks.all() as TaskRow[];
    },

    updateTaskHistory(id: string, history: Message[]): void {
      stmts.updateTaskHistory.run(JSON.stringify(history), id);
    },

    updateRoutingStats(
      agentName: string,
      category: string,
      success: boolean,
      latencyMs: number,
      cost: number
    ): void {
      const successes = success ? 1 : 0;
      const failures = success ? 0 : 1;
      stmts.upsertRoutingStats.run(
        agentName,
        category,
        successes,
        failures,
        latencyMs,
        cost
      );
    },

    getRoutingStats(): RoutingStatsRow[] {
      return stmts.getRoutingStats.all() as RoutingStatsRow[];
    },

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

    close(): void {
      sqlite.close();
    },
  };
}
