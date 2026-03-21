import { v4 as uuidv4 } from "uuid";
import type { LatticeDB } from "./db.js";
import type { LatticeTaskManager } from "./task-manager.js";
import type { LatticeEventBus } from "./event-bus.js";
import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowContext,
  NodeOutput,
  AgentTaskConfig,
  ConditionConfig,
} from "./workflow-types.js";
import { topoSort } from "./workflow-topo.js";
import { evaluateCondition, resolveTemplate, applyDataMapping } from "./workflow-condition.js";

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

    // Unknown node type
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

      const finalStatus = failed ? "failed" : "completed";
      db.updateWorkflowRun(runId, { status: finalStatus, context: context as unknown as Record<string, unknown> });
      eventBus.emit({ type: "workflow:completed", runId });

      return { id: runId, workflowId, status: finalStatus, context };
    },
  };
}
