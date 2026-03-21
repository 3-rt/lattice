import type { AgentCard, Task, TaskStatusUpdate } from "./types.js";

export interface LatticeAdapter {
  getAgentCard(): AgentCard;
  executeTask(task: Task): Promise<Task>;
  streamTask(task: Task): AsyncGenerator<TaskStatusUpdate>;
  healthCheck(): Promise<boolean>;
}
