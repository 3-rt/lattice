import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { clsx } from "clsx";
import type { AgentTaskConfig, ConditionConfig } from "../../lib/api.ts";
import { useWorkflowStore } from "../../store/workflow-store.ts";
import { AgentTaskNode } from "./agent-task-node.tsx";
import { ConditionNode } from "./condition-node.tsx";
import { WorkflowEdge } from "./workflow-edge.tsx";
import { WorkflowList } from "./workflow-list.tsx";

const nodeTypes = {
  "agent-task": AgentTaskNode,
  condition: ConditionNode,
};

const edgeTypes = {
  workflow: WorkflowEdge,
};

export function WorkflowRunner() {
  const workflows = useWorkflowStore((state) => state.workflows);
  const selectedWorkflowId = useWorkflowStore(
    (state) => state.selectedWorkflowId
  );
  const activeRunStatus = useWorkflowStore((state) => state.activeRunStatus);
  const stepStatuses = useWorkflowStore((state) => state.stepStatuses);
  const resetRun = useWorkflowStore((state) => state.resetRun);

  const workflow = workflows.find((item) => item.id === selectedWorkflowId);

  const { nodes, edges } = useMemo(() => {
    if (!workflow) return { nodes: [] as Node[], edges: [] as Edge[] };

    return {
      nodes: workflow.definition.nodes.map((node, index) => {
        const position = {
          x: 100 + (index % 3) * 280,
          y: 100 + Math.floor(index / 3) * 180,
        };
        const stepStatus = stepStatuses.get(node.id)?.status;

        if (node.type === "agent-task") {
          const config = node.config as AgentTaskConfig;
          return {
            id: node.id,
            type: node.type,
            position,
            data: {
              label: node.label,
              agent: config.agent,
              taskTemplate: config.taskTemplate,
              stepStatus,
            },
            draggable: false,
            selectable: false,
          };
        }

        const config = node.config as ConditionConfig;
        return {
          id: node.id,
          type: node.type,
          position,
          data: {
            label: node.label,
            field: config.field,
            operator: config.operator,
            value: config.value,
            stepStatus,
          },
          draggable: false,
          selectable: false,
        };
      }),
      edges: workflow.definition.edges.map((edge) => ({
        id: `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        type: "workflow",
        data: { dataMapping: edge.dataMapping },
      })),
    };
  }, [stepStatuses, workflow]);

  return (
    <div className="flex h-full">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-gray-800 p-3">
        <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          Saved Workflows
        </h3>
        <WorkflowList />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {activeRunStatus !== "idle" && (
          <div
            className={clsx(
              "flex items-center gap-2 border-b px-4 py-2 text-xs",
              activeRunStatus === "working" &&
                "border-lattice-800 bg-lattice-950/50 text-lattice-300",
              activeRunStatus === "completed" &&
                "border-emerald-800 bg-emerald-950/50 text-emerald-300",
              activeRunStatus === "failed" &&
                "border-red-800 bg-red-950/50 text-red-300"
            )}
          >
            {activeRunStatus === "working" && (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Workflow running...
              </>
            )}
            {activeRunStatus === "completed" && (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Workflow completed
              </>
            )}
            {activeRunStatus === "failed" && (
              <>
                <XCircle className="h-3.5 w-3.5" />
                Workflow failed
              </>
            )}
            <button
              type="button"
              onClick={resetRun}
              className="ml-auto text-[10px] uppercase tracking-wider text-gray-500 hover:text-gray-300"
            >
              Dismiss
            </button>
          </div>
        )}

        {workflow ? (
          <div className="min-h-0 flex-1">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              connectionMode={ConnectionMode.Loose}
              fitView
              fitViewOptions={{ padding: 0.3 }}
              proOptions={{ hideAttribution: true }}
              minZoom={0.3}
              maxZoom={2}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnDrag
              zoomOnScroll
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={20}
                size={1}
                color="rgba(75, 85, 99, 0.15)"
              />
            </ReactFlow>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-gray-600">
              Select a workflow to view and run it.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
