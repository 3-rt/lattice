import type { AgentCard, Task, TaskStatusUpdate, HealthCheckResult } from "./types.js";

export interface LatticeAdapter {
  getAgentCard(): AgentCard;
  executeTask(task: Task): Promise<Task>;
  streamTask(task: Task): AsyncGenerator<TaskStatusUpdate>;
  healthCheck(): Promise<HealthCheckResult>;
}
