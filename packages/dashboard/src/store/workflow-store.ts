import { create } from "zustand";
import type { WorkflowDefinition, WorkflowInfo, WorkflowRunInfo } from "../lib/api.ts";

export interface EditorNode {
  id: string;
  type: "agent-task" | "condition";
  label: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
}

export interface EditorEdge {
  id: string;
  source: string;
  target: string;
  dataMapping?: Record<string, string>;
}

export interface RunStepStatus {
  stepId: string;
  status: "pending" | "working" | "completed" | "failed" | "skipped";
}

interface WorkflowState {
  workflows: WorkflowInfo[];
  setWorkflows: (workflows: WorkflowInfo[]) => void;
  addWorkflow: (workflow: WorkflowInfo) => void;

  activeTab: "editor" | "runner";
  setActiveTab: (tab: "editor" | "runner") => void;

  editorNodes: EditorNode[];
  editorEdges: EditorEdge[];
  selectedNodeId: string | null;
  editingWorkflowId: string | null;
  workflowName: string;
  setEditorNodes: (nodes: EditorNode[]) => void;
  setEditorEdges: (edges: EditorEdge[]) => void;
  setSelectedNodeId: (id: string | null) => void;
  addEditorNode: (node: EditorNode) => void;
  updateEditorNode: (id: string, updates: Partial<EditorNode>) => void;
  removeEditorNode: (id: string) => void;
  addEditorEdge: (edge: EditorEdge) => void;
  removeEditorEdge: (id: string) => void;
  setWorkflowName: (name: string) => void;
  setEditingWorkflowId: (id: string | null) => void;
  clearEditor: () => void;
  loadWorkflowIntoEditor: (workflow: WorkflowInfo) => void;

  selectedWorkflowId: string | null;
  setSelectedWorkflowId: (id: string | null) => void;
  activeRunId: string | null;
  activeRunStatus: "idle" | "working" | "completed" | "failed";
  stepStatuses: Map<string, RunStepStatus>;
  runs: WorkflowRunInfo[];
  setRuns: (runs: WorkflowRunInfo[]) => void;
  startRun: (runId: string, workflowId?: string) => void;
  updateStepStatus: (stepId: string, status: RunStepStatus["status"]) => void;
  completeRun: () => void;
  resetRun: () => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  workflows: [],
  setWorkflows: (workflows) => set({ workflows }),
  addWorkflow: (workflow) =>
    set((state) => ({
      workflows: [...state.workflows.filter((item) => item.id !== workflow.id), workflow],
    })),

  activeTab: "editor",
  setActiveTab: (activeTab) => set({ activeTab }),

  editorNodes: [],
  editorEdges: [],
  selectedNodeId: null,
  editingWorkflowId: null,
  workflowName: "",
  setEditorNodes: (editorNodes) => set({ editorNodes }),
  setEditorEdges: (editorEdges) => set({ editorEdges }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  addEditorNode: (node) =>
    set((state) => ({ editorNodes: [...state.editorNodes, node] })),
  updateEditorNode: (id, updates) =>
    set((state) => ({
      editorNodes: state.editorNodes.map((node) =>
        node.id === id ? { ...node, ...updates } : node
      ),
    })),
  removeEditorNode: (id) =>
    set((state) => ({
      editorNodes: state.editorNodes.filter((node) => node.id !== id),
      editorEdges: state.editorEdges.filter(
        (edge) => edge.source !== id && edge.target !== id
      ),
      selectedNodeId:
        state.selectedNodeId === id ? null : state.selectedNodeId,
    })),
  addEditorEdge: (edge) =>
    set((state) => ({ editorEdges: [...state.editorEdges, edge] })),
  removeEditorEdge: (id) =>
    set((state) => ({
      editorEdges: state.editorEdges.filter((edge) => edge.id !== id),
    })),
  setWorkflowName: (workflowName) => set({ workflowName }),
  setEditingWorkflowId: (editingWorkflowId) => set({ editingWorkflowId }),
  clearEditor: () =>
    set({
      editorNodes: [],
      editorEdges: [],
      selectedNodeId: null,
      editingWorkflowId: null,
      workflowName: "",
    }),
  loadWorkflowIntoEditor: (workflow) => {
    const nodes: EditorNode[] = workflow.definition.nodes.map((node, index) => ({
      id: node.id,
      type: node.type,
      label: node.label,
      config: node.config as unknown as Record<string, unknown>,
      position: {
        x: 100 + (index % 3) * 280,
        y: 100 + Math.floor(index / 3) * 180,
      },
    }));

    const edges: EditorEdge[] = workflow.definition.edges.map((edge) => ({
      id: `${edge.source}-${edge.target}`,
      source: edge.source,
      target: edge.target,
      dataMapping: edge.dataMapping,
    }));

    set({
      editorNodes: nodes,
      editorEdges: edges,
      selectedNodeId: null,
      editingWorkflowId: workflow.id,
      workflowName: workflow.name,
    });
  },

  selectedWorkflowId: null,
  setSelectedWorkflowId: (selectedWorkflowId) => set({ selectedWorkflowId }),
  activeRunId: null,
  activeRunStatus: "idle",
  stepStatuses: new Map(),
  runs: [],
  setRuns: (runs) => set({ runs }),
  startRun: (runId, workflowId) => {
    const selectedWorkflowId = workflowId ?? get().selectedWorkflowId;
    const workflow = get().workflows.find((item) => item.id === selectedWorkflowId);
    const stepStatuses = new Map<string, RunStepStatus>();

    if (workflow) {
      for (const node of workflow.definition.nodes) {
        stepStatuses.set(node.id, { stepId: node.id, status: "pending" });
      }
    }

    set({
      selectedWorkflowId: selectedWorkflowId ?? get().selectedWorkflowId,
      activeRunId: runId,
      activeRunStatus: "working",
      stepStatuses,
    });
  },
  updateStepStatus: (stepId, status) =>
    set((state) => {
      const stepStatuses = new Map(state.stepStatuses);
      stepStatuses.set(stepId, { stepId, status });
      return {
        stepStatuses,
        activeRunStatus:
          status === "failed" ? "failed" : state.activeRunStatus,
      };
    }),
  completeRun: () =>
    set((state) => ({
      activeRunStatus:
        state.activeRunStatus === "failed" ? "failed" : "completed",
    })),
  resetRun: () =>
    set({
      activeRunId: null,
      activeRunStatus: "idle",
      stepStatuses: new Map(),
    }),
}));
