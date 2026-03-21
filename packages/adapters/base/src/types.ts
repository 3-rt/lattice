export interface AgentCard {
  name: string;
  description: string;
  url: string;
  version: string;
  capabilities: {
    streaming: boolean;
    pushNotifications: boolean;
  };
  skills: Skill[];
  authentication: {
    schemes: string[];
  };
}

export interface Skill {
  id: string;
  name: string;
  description: string;
  tags: string[];
}

export type TaskStatus =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled";

export interface Task {
  id: string;
  status: TaskStatus;
  artifacts: Artifact[];
  history: Message[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    assignedAgent: string;
    routingReason: string;
    latencyMs: number;
    cost?: number;
    workflowId?: string;
    workflowStepId?: string;
  };
}

export interface Message {
  role: "user" | "agent";
  parts: Part[];
}

export interface Part {
  type: "text" | "file" | "data";
  text?: string;
  file?: { name: string; mimeType: string; bytes: string };
  data?: Record<string, unknown>;
}

export interface Artifact {
  name: string;
  parts: Part[];
}

export interface TaskStatusUpdate {
  taskId: string;
  status: TaskStatus;
  message?: string;
  artifacts?: Artifact[];
}

export type SSEEventType =
  | { type: "agent:registered"; agent: AgentCard }
  | { type: "agent:deregistered"; agentName: string }
  | { type: "agent:status"; agentName: string; status: string }
  | { type: "task:created"; task: Task }
  | { type: "task:routed"; taskId: string; agentName: string; reason: string }
  | { type: "task:progress"; taskId: string; message: string }
  | { type: "task:completed"; task: Task }
  | { type: "task:failed"; taskId: string; error: string }
  | { type: "task:canceled"; taskId: string }
  | { type: "task:input-required"; taskId: string; message: string }
  | { type: "workflow:started"; runId: string; workflowId: string }
  | { type: "workflow:step"; runId: string; stepId: string; status: string }
  | { type: "workflow:completed"; runId: string }
  | { type: "message:sent"; from: string; to: string; taskId: string; preview: string }
  | { type: "message:received"; from: string; to: string; taskId: string; preview: string };
