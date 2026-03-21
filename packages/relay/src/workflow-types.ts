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
