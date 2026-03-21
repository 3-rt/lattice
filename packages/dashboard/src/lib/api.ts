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
