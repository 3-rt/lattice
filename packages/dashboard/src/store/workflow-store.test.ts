import { beforeEach, describe, expect, it } from "vitest";
import type { WorkflowInfo, WorkflowRunInfo } from "../lib/api.ts";
import { useWorkflowStore } from "./workflow-store.ts";

function makeWorkflow(overrides: Partial<WorkflowInfo> = {}): WorkflowInfo {
  return {
    id: "wf-1",
    name: "Bug Fix Pipeline",
    definition: {
      nodes: [
        {
          id: "step-a",
          type: "agent-task",
          label: "Investigate",
          config: { agent: "auto", taskTemplate: "Investigate {{bug}}" },
        },
        {
          id: "step-b",
          type: "condition",
          label: "Succeeded?",
          config: { field: "step-a.status", operator: "equals", value: "completed" },
        },
      ],
      edges: [{ source: "step-a", target: "step-b" }],
    },
    createdAt: "2026-03-21T12:00:00.000Z",
    ...overrides,
  };
}

function makeRun(overrides: Partial<WorkflowRunInfo> = {}): WorkflowRunInfo {
  return {
    id: "run-1",
    workflowId: "wf-1",
    status: "running",
    context: null,
    startedAt: "2026-03-21T12:05:00.000Z",
    completedAt: null,
    ...overrides,
  };
}

describe("WorkflowStore", () => {
  beforeEach(() => {
    useWorkflowStore.setState({
      workflows: [],
      activeTab: "editor",
      editorNodes: [],
      editorEdges: [],
      selectedNodeId: null,
      editingWorkflowId: null,
      workflowName: "",
      selectedWorkflowId: null,
      activeRunId: null,
      activeRunStatus: "idle",
      stepStatuses: new Map(),
      runs: [],
    });
  });

  it("loads a workflow into the editor", () => {
    const workflow = makeWorkflow();

    useWorkflowStore.getState().loadWorkflowIntoEditor(workflow);

    const state = useWorkflowStore.getState();
    expect(state.editingWorkflowId).toBe(workflow.id);
    expect(state.workflowName).toBe(workflow.name);
    expect(state.editorNodes).toHaveLength(2);
    expect(state.editorEdges).toEqual([
      {
        id: "step-a-step-b",
        source: "step-a",
        target: "step-b",
        dataMapping: undefined,
      },
    ]);
  });

  it("starts a run using the selected workflow and marks steps pending", () => {
    const workflow = makeWorkflow();
    const store = useWorkflowStore.getState();
    store.setWorkflows([workflow]);
    store.setSelectedWorkflowId(workflow.id);

    store.startRun("run-1", workflow.id);

    const state = useWorkflowStore.getState();
    expect(state.activeRunId).toBe("run-1");
    expect(state.activeRunStatus).toBe("working");
    expect(Array.from(state.stepStatuses.entries())).toEqual([
      ["step-a", { stepId: "step-a", status: "pending" }],
      ["step-b", { stepId: "step-b", status: "pending" }],
    ]);
  });

  it("marks the run failed when a workflow step fails", () => {
    const workflow = makeWorkflow();
    const store = useWorkflowStore.getState();
    store.setWorkflows([workflow]);
    store.setSelectedWorkflowId(workflow.id);
    store.startRun("run-1", workflow.id);

    store.updateStepStatus("step-a", "failed");
    store.completeRun();

    const state = useWorkflowStore.getState();
    expect(state.activeRunStatus).toBe("failed");
    expect(state.stepStatuses.get("step-a")).toEqual({
      stepId: "step-a",
      status: "failed",
    });
  });

  it("stores fetched workflow runs", () => {
    const runs = [makeRun(), makeRun({ id: "run-2", status: "completed" })];

    useWorkflowStore.getState().setRuns(runs);

    expect(useWorkflowStore.getState().runs).toEqual(runs);
  });
});
