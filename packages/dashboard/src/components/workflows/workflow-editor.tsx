import { useCallback, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  ReactFlow,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type OnEdgesChange,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { FilePlus, Save } from "lucide-react";
import {
  createWorkflow,
  type WorkflowDefinition,
} from "../../lib/api.ts";
import { useWorkflowStore, type EditorNode } from "../../store/workflow-store.ts";
import { AgentTaskNode } from "./agent-task-node.tsx";
import { ConditionNode } from "./condition-node.tsx";
import { NodePalette } from "./node-palette.tsx";
import { PropertiesPanel } from "./properties-panel.tsx";
import { WorkflowEdge } from "./workflow-edge.tsx";

const nodeTypes = {
  "agent-task": AgentTaskNode,
  condition: ConditionNode,
};

const edgeTypes = {
  workflow: WorkflowEdge,
};

let idCounter = 0;

function nextNodeId() {
  idCounter += 1;
  return `node-${Date.now()}-${idCounter}`;
}

function WorkflowCanvas({
  rfNodes,
  rfEdges,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onNodeClick,
  onEdgeClick,
  onPaneClick,
}: {
  rfNodes: Node[];
  rfEdges: Edge[];
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  onNodeClick: (_: React.MouseEvent, node: Node) => void;
  onEdgeClick: (_: React.MouseEvent, edge: Edge) => void;
  onPaneClick: () => void;
}) {
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const addEditorNode = useWorkflowStore((state) => state.addEditorNode);

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const nodeType = event.dataTransfer.getData("application/lattice-node-type");
      if (!nodeType || !rfInstance) return;

      const position = rfInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      addEditorNode({
        id: nextNodeId(),
        type: nodeType as EditorNode["type"],
        label: nodeType === "agent-task" ? "New Task" : "Condition",
        config:
          nodeType === "agent-task"
            ? { agent: "auto", taskTemplate: "" }
            : { field: "", operator: "equals", value: "" },
        position,
      });

      setTimeout(() => rfInstance.fitView({ padding: 0.3, duration: 300 }), 50);
    },
    [rfInstance, addEditorNode]
  );

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onNodeClick={onNodeClick}
      onEdgeClick={onEdgeClick}
      onPaneClick={onPaneClick}
      deleteKeyCode={["Backspace", "Delete"]}
      onInit={setRfInstance}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
      }}
      onDrop={onDrop}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      connectionMode={ConnectionMode.Strict}
      fitView
      fitViewOptions={{ padding: 0.3 }}
      proOptions={{ hideAttribution: true }}
      minZoom={0.3}
      maxZoom={2}
      defaultEdgeOptions={{ type: "workflow" }}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={20}
        size={1}
        color="rgba(75, 85, 99, 0.15)"
      />
      <Controls className="!rounded-md !border-gray-700 !bg-gray-900 [&>button]:!border-gray-700 [&>button]:!bg-gray-800 [&>button]:!text-gray-400 [&>button:hover]:!bg-gray-700" />
    </ReactFlow>
  );
}

export function WorkflowEditor() {
  const editorNodes = useWorkflowStore((state) => state.editorNodes);
  const editorEdges = useWorkflowStore((state) => state.editorEdges);
  const selectedNodeId = useWorkflowStore((state) => state.selectedNodeId);
  const setEditorNodes = useWorkflowStore((state) => state.setEditorNodes);
  const setEditorEdges = useWorkflowStore((state) => state.setEditorEdges);
  const setSelectedNodeId = useWorkflowStore((state) => state.setSelectedNodeId);
  const setWorkflowName = useWorkflowStore((state) => state.setWorkflowName);
  const workflowName = useWorkflowStore((state) => state.workflowName);
  const addWorkflow = useWorkflowStore((state) => state.addWorkflow);
  const clearEditor = useWorkflowStore((state) => state.clearEditor);
  const [saving, setSaving] = useState(false);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

  const rfNodesRef = useRef<Node[]>([]);
  const editorNodesRef = useRef<EditorNode[]>([]);
  const rfEdgesRef = useRef<Edge[]>([]);

  const rfNodes: Node[] = useMemo(
    () =>
      editorNodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        selected: node.id === selectedNodeId,
        data:
          node.type === "agent-task"
            ? {
                label: node.label,
                agent: (node.config.agent as string) ?? "auto",
                taskTemplate: (node.config.taskTemplate as string) ?? "",
                selected: node.id === selectedNodeId,
              }
            : {
                label: node.label,
                field: (node.config.field as string) ?? "",
                operator: (node.config.operator as string) ?? "equals",
                value: node.config.value as string | undefined,
                selected: node.id === selectedNodeId,
              },
      })),
    [editorNodes, selectedNodeId]
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      editorEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "workflow",
        selected: edge.id === selectedEdgeId,
        data: { dataMapping: edge.dataMapping },
      })),
    [editorEdges, selectedEdgeId]
  );

  // Keep refs always current so callbacks never capture stale values
  rfNodesRef.current = rfNodes;
  editorNodesRef.current = editorNodes;
  rfEdgesRef.current = rfEdges;

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      // Dimension changes are tracked internally by React Flow — syncing them
      // back to our store would trigger an infinite re-render loop.
      const meaningful = changes.filter((c) => c.type !== "dimensions");
      if (meaningful.length === 0) return;

      const changedNodes = applyNodeChanges(meaningful, rfNodesRef.current);
      const nextNodes: EditorNode[] = changedNodes.map((rfNode) => {
        const existing = editorNodesRef.current.find((node) => node.id === rfNode.id);
        return {
          id: rfNode.id,
          type: (rfNode.type as EditorNode["type"]) ?? "agent-task",
          label: existing?.label ?? "Untitled",
          config: existing?.config ?? {},
          position: rfNode.position,
        };
      });
      setEditorNodes(nextNodes);

      for (const change of meaningful) {
        if (change.type === "select" && change.selected) {
          setSelectedNodeId(change.id);
        }
      }
    },
    [setEditorNodes, setSelectedNodeId]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => {
      for (const c of changes) {
        if (c.type === "select") {
          setSelectedEdgeId(c.selected ? c.id : null);
        }
      }

      const removals = changes.filter((c) => c.type === "remove");
      if (removals.length > 0) {
        const changedEdges = applyEdgeChanges(removals, rfEdgesRef.current);
        setEditorEdges(
          changedEdges.map((edge) => ({
            id: edge.id,
            source: edge.source,
            target: edge.target,
            dataMapping: (edge.data as { dataMapping?: Record<string, string> } | undefined)
              ?.dataMapping,
          }))
        );
        setSelectedEdgeId(null);
      }
    },
    [setEditorEdges]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      const nextEdges = addEdge(
        { ...connection, type: "workflow" },
        rfEdges
      );
      setEditorEdges(
        nextEdges.map((edge) => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          dataMapping: (edge.data as { dataMapping?: Record<string, string> } | undefined)
            ?.dataMapping,
        }))
      );
    },
    [rfEdges, setEditorEdges]
  );

  async function handleSave() {
    if (!workflowName.trim() || editorNodes.length === 0 || saving) return;

    const definition: WorkflowDefinition = {
      nodes: editorNodes.map((node) => ({
        id: node.id,
        type: node.type,
        label: node.label,
        config:
          node.config as unknown as WorkflowDefinition["nodes"][number]["config"],
      })),
      edges: editorEdges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        ...(edge.dataMapping ? { dataMapping: edge.dataMapping } : {}),
      })),
    };

    setSaving(true);
    try {
      const workflow = await createWorkflow(workflowName.trim(), definition);
      addWorkflow(workflow);
    } catch (error) {
      console.error("Failed to save workflow:", error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full">
      <div className="w-48 shrink-0 space-y-4 overflow-y-auto border-r border-gray-800 p-3">
        <NodePalette />

        <div className="border-t border-gray-800 pt-3">
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-gray-500">
            Workflow Name
          </label>
          <input
            type="text"
            value={workflowName}
            onChange={(event) => setWorkflowName(event.target.value)}
            placeholder="My Workflow"
            className="w-full rounded-md border border-gray-700 bg-gray-900 px-2.5 py-1.5 text-xs text-gray-100 placeholder:text-gray-600 focus:border-lattice-600 focus:outline-none focus:ring-1 focus:ring-lattice-600"
          />
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || !workflowName.trim() || editorNodes.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-lattice-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-lattice-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? "Saving..." : "Save Workflow"}
          </button>
          <button
            type="button"
            onClick={clearEditor}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-700 px-3 py-1.5 text-xs text-gray-400 transition-colors hover:bg-gray-800"
          >
            <FilePlus className="h-3.5 w-3.5" />
            New Workflow
          </button>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <WorkflowCanvas
          rfNodes={rfNodes}
          rfEdges={rfEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, node) => { setSelectedNodeId(node.id); setSelectedEdgeId(null); }}
          onEdgeClick={() => setSelectedNodeId(null)}
          onPaneClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null); }}
        />
      </div>

      <div className="w-56 shrink-0 overflow-y-auto border-l border-gray-800">
        <PropertiesPanel />
      </div>
    </div>
  );
}
