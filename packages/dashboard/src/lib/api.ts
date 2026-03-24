const BASE_URL = "/api";

export interface AgentInfo {
  name: string;
  status: string;
  statusReason?: string;
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

export interface RoutingStatsRow {
  agent_name: string;
  category: string;
  successes: number;
  failures: number;
  total_latency_ms: number;
  total_cost: number;
  updated_at: string;
}

export interface AgentTaskConfig {
  agent: string;
  taskTemplate: string;
}

export interface ConditionConfig {
  field: string;
  operator:
    | "equals"
    | "not_equals"
    | "contains"
    | "not_contains"
    | "is_empty"
    | "not_empty";
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
  id: string;
  workflowId: string;
  status: "running" | "completed" | "failed";
  context: Record<string, unknown> | null;
  startedAt: string;
  completedAt: string | null;
}

interface WorkflowInfoResponse {
  id: string;
  name: string;
  definition: WorkflowDefinition;
  created_at?: string;
}

interface WorkflowRunResponse {
  id: string;
  workflowId?: string;
  workflow_id?: string;
  status: "running" | "completed" | "failed";
  context?: Record<string, unknown> | null;
  started_at?: string;
  completed_at?: string | null;
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

export async function fetchRoutingStats(): Promise<RoutingStatsRow[]> {
  const res = await fetch(`${BASE_URL}/routing/stats`);
  if (!res.ok) throw new Error(`Failed to fetch routing stats: ${res.status}`);
  return res.json();
}

export async function fetchWorkflows(): Promise<WorkflowInfo[]> {
  const res = await fetch(`${BASE_URL}/workflows`);
  if (!res.ok) throw new Error(`Failed to fetch workflows: ${res.status}`);
  const rows = (await res.json()) as WorkflowInfoResponse[];
  return rows.map(normalizeWorkflowInfo);
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
  const row = (await res.json()) as WorkflowInfoResponse;
  return normalizeWorkflowInfo(row);
}

export async function runWorkflow(workflowId: string): Promise<WorkflowRunInfo> {
  const res = await fetch(`${BASE_URL}/workflows/${workflowId}/run`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to run workflow: ${res.status}`);
  const row = (await res.json()) as WorkflowRunResponse;
  return normalizeWorkflowRun(row);
}

export async function fetchWorkflowRuns(
  workflowId: string
): Promise<WorkflowRunInfo[]> {
  const res = await fetch(`${BASE_URL}/workflows/${workflowId}/runs`);
  if (!res.ok) throw new Error(`Failed to fetch workflow runs: ${res.status}`);
  const rows = (await res.json()) as WorkflowRunResponse[];
  return rows.map(normalizeWorkflowRun);
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

function normalizeWorkflowInfo(row: WorkflowInfoResponse): WorkflowInfo {
  return {
    id: row.id,
    name: row.name,
    definition: row.definition,
    createdAt: row.created_at ?? "",
  };
}

function normalizeWorkflowRun(row: WorkflowRunResponse): WorkflowRunInfo {
  return {
    id: row.id,
    workflowId: row.workflowId ?? row.workflow_id ?? "",
    status: row.status,
    context: row.context ?? null,
    startedAt: row.started_at ?? "",
    completedAt: row.completed_at ?? null,
  };
}
