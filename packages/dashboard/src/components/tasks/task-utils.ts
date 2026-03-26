import type { RoutingStatsRow, TaskInfo } from "../../lib/api.ts";

export function getTaskInputText(task: TaskInfo): string {
  return task.history
    .filter((message) => message.role === "user")
    .flatMap((message) =>
      message.parts
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text!.trim())
        .filter(Boolean)
    )
    .join("\n");
}

export function getTaskOutputText(task: TaskInfo): string {
  return task.artifacts
    .flatMap((artifact) =>
      artifact.parts
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text!.trim())
        .filter(Boolean)
    )
    .join("\n");
}

export function filterTasks(
  tasks: TaskInfo[],
  statusFilter: string,
  agentFilter: string
): TaskInfo[] {
  return tasks.filter((task) => {
    if (statusFilter && task.status !== statusFilter) return false;
    if (agentFilter && task.metadata?.assignedAgent !== agentFilter) return false;
    return true;
  });
}

export function getRoutingStatsSummary(row: RoutingStatsRow): {
  total: number;
  successRate: number;
  averageLatencyMs: number;
} {
  const total = row.successes + row.failures;
  return {
    total,
    successRate: total > 0 ? (row.successes / total) * 100 : 0,
    averageLatencyMs: total > 0 ? Math.round(row.total_latency_ms / total) : 0,
  };
}

export function getTaskErrorDetail(task: TaskInfo): string | undefined {
  if (task.status !== "failed") return undefined;
  const errorArtifact = task.artifacts?.find((a) => a.name === "error");
  return errorArtifact?.parts
    ?.filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text!)
    .join("\n") || undefined;
}
