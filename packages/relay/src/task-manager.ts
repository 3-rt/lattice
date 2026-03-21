import { v4 as uuidv4 } from "uuid";
import type { Task, Artifact, Message } from "@lattice/adapter-base";
import type { LatticeDB, TaskRow, TaskFilter } from "./db.js";
import type { LatticeEventBus } from "./event-bus.js";
import type { LatticeRegistry } from "./registry.js";
import type { LatticeRouter } from "./router.js";
import { categorize } from "./categorizer.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// In-memory store for explicit agent preferences (to avoid FK constraint issues)
const explicitAgentPrefs = new Map<string, string>();

function rowToTask(row: TaskRow): Task {
  const history: Message[] = JSON.parse(row.history);

  let artifacts: Artifact[] = [];
  if (row.result !== null) {
    try {
      const parsed = JSON.parse(row.result);
      // If it's an error object, no artifacts
      if (Array.isArray(parsed)) {
        artifacts = parsed as Artifact[];
      }
    } catch {
      artifacts = [];
    }
  }

  return {
    id: row.id,
    status: row.status as Task["status"],
    artifacts,
    history,
    metadata: {
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      assignedAgent: row.assigned_agent ?? "",
      routingReason: row.routing_reason ?? "",
      latencyMs: row.latency_ms ?? 0,
      cost: row.cost ?? undefined,
      workflowId: row.workflow_id ?? undefined,
      workflowStepId: row.workflow_step_id ?? undefined,
    },
  };
}

export interface LatticeTaskManager {
  createTask(text: string, explicitAgent?: string): Promise<Task>;
  executeTask(taskId: string): Promise<Task>;
  getTask(taskId: string): Task | undefined;
  listTasks(filter?: TaskFilter): Task[];
  cancelTask(taskId: string): void;
  provideInput(taskId: string, text: string): void;
}

export function createTaskManager(
  db: LatticeDB,
  eventBus: LatticeEventBus,
  registry: LatticeRegistry,
  router: LatticeRouter
): LatticeTaskManager {
  return {
    async createTask(text: string, explicitAgent?: string): Promise<Task> {
      const id = uuidv4();
      const history: Message[] = [
        { role: "user", parts: [{ type: "text", text }] },
      ];

      db.insertTask(id, history);

      // Store explicit agent preference in memory (avoids FK constraint)
      if (explicitAgent) {
        explicitAgentPrefs.set(id, explicitAgent);
      }

      const row = db.getTask(id)!;
      const task = rowToTask(row);

      eventBus.emit({ type: "task:created", task });

      return task;
    },

    async executeTask(taskId: string): Promise<Task> {
      const row = db.getTask(taskId);
      if (!row) throw new Error(`Task "${taskId}" not found`);

      const task = rowToTask(row);
      const startTime = Date.now();

      // Determine explicit agent (from memory store)
      const explicitAgent = explicitAgentPrefs.get(taskId);

      // Route the task
      let agentName: string;
      let reason: string;
      try {
        const routeResult = router.route(
          task.history[0]?.parts[0]?.text ?? "",
          explicitAgent
        );
        agentName = routeResult.agentName;
        reason = routeResult.reason;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        db.updateTask(taskId, { status: "failed", result: JSON.stringify({ error: errorMsg }) });
        const failedTask = rowToTask(db.getTask(taskId)!);
        eventBus.emit({ type: "task:failed", taskId, error: errorMsg });
        return failedTask;
      }

      // Categorize the task text for routing stats
      const taskText = task.history[0]?.parts[0]?.text ?? "";
      const category = categorize(taskText);

      // Update DB with routing info and status working
      db.updateTask(taskId, {
        status: "working",
        assigned_agent: agentName,
        routing_reason: reason,
      });

      eventBus.emit({ type: "task:routed", taskId, agentName, reason });

      // Get the adapter
      const adapter = registry.getAdapter(agentName);
      if (!adapter) {
        const errorMsg = `Adapter for agent "${agentName}" not found`;
        db.updateTask(taskId, { status: "failed", result: JSON.stringify({ error: errorMsg }) });
        const failedTask = rowToTask(db.getTask(taskId)!);
        eventBus.emit({ type: "task:failed", taskId, error: errorMsg });
        return failedTask;
      }

      // Build the task object to pass to the adapter
      const workingRow = db.getTask(taskId)!;
      const workingTask = rowToTask(workingRow);

      // Execute with timeout
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Task execution timed out")), DEFAULT_TIMEOUT_MS)
      );

      let resultTask: Task;
      try {
        resultTask = await Promise.race([
          adapter.executeTask(workingTask),
          timeoutPromise,
        ]);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const latencyMs = Date.now() - startTime;
        db.updateTask(taskId, {
          status: "failed",
          result: JSON.stringify({ error: errorMsg }),
          latency_ms: latencyMs,
        });
        db.updateRoutingStats(agentName, category, false, latencyMs, 0);
        const failedTask = rowToTask(db.getTask(taskId)!);
        eventBus.emit({ type: "task:failed", taskId, error: errorMsg });
        return failedTask;
      }

      // Success path
      const latencyMs = Date.now() - startTime;
      db.updateTask(taskId, {
        status: "completed",
        result: JSON.stringify(resultTask.artifacts ?? []),
        latency_ms: latencyMs,
      });
      db.updateRoutingStats(agentName, category, true, latencyMs, 0);

      const completedRow = db.getTask(taskId)!;
      const completedTask = rowToTask(completedRow);

      eventBus.emit({ type: "task:completed", task: completedTask });

      // Clean up explicit agent pref
      explicitAgentPrefs.delete(taskId);

      return completedTask;
    },

    getTask(taskId: string): Task | undefined {
      const row = db.getTask(taskId);
      if (!row) return undefined;
      return rowToTask(row);
    },

    listTasks(filter?: TaskFilter): Task[] {
      const rows = db.listTasks(filter);
      return rows.map(rowToTask);
    },

    cancelTask(taskId: string): void {
      db.updateTask(taskId, { status: "canceled" });
      eventBus.emit({ type: "task:canceled", taskId });
    },

    provideInput(taskId: string, text: string): void {
      const row = db.getTask(taskId);
      if (!row) throw new Error(`Task "${taskId}" not found`);

      const history: Message[] = JSON.parse(row.history);
      history.push({ role: "user", parts: [{ type: "text", text }] });
      db.updateTaskHistory(taskId, history);
      db.updateTask(taskId, { status: "working" });
    },
  };
}
