import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWorkflow,
  fetchWorkflowRuns,
  fetchWorkflows,
  runWorkflow,
  type WorkflowDefinition,
} from "./api.ts";

const definition: WorkflowDefinition = {
  nodes: [
    {
      id: "step-1",
      type: "agent-task",
      label: "Step 1",
      config: { agent: "auto", taskTemplate: "Fix it" },
    },
  ],
  edges: [],
};

describe("workflow API helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("normalizes workflow rows from the server", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: "wf-1",
            name: "Bug Fix Pipeline",
            definition,
            created_at: "2026-03-21 12:00:00",
          },
        ],
      })
    );

    await expect(fetchWorkflows()).resolves.toEqual([
      {
        id: "wf-1",
        name: "Bug Fix Pipeline",
        definition,
        createdAt: "2026-03-21 12:00:00",
      },
    ]);
  });

  it("posts a workflow definition to the server", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "wf-1",
        name: "Bug Fix Pipeline",
        definition,
      }),
    });

    vi.stubGlobal("fetch", fetchMock);

    await expect(createWorkflow("Bug Fix Pipeline", definition)).resolves.toEqual({
      id: "wf-1",
      name: "Bug Fix Pipeline",
      definition,
      createdAt: "",
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Bug Fix Pipeline", definition }),
    });
  });

  it("normalizes the workflow run response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "run-1",
          workflowId: "wf-1",
          status: "completed",
          context: { "step-1": { status: "completed" } },
        }),
      })
    );

    await expect(runWorkflow("wf-1")).resolves.toEqual({
      id: "run-1",
      workflowId: "wf-1",
      status: "completed",
      context: { "step-1": { status: "completed" } },
      startedAt: "",
      completedAt: null,
    });
  });

  it("normalizes workflow run history rows", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [
          {
            id: "run-1",
            workflow_id: "wf-1",
            status: "completed",
            context: { "step-1": { status: "completed" } },
            started_at: "2026-03-21 12:05:00",
            completed_at: "2026-03-21 12:06:00",
          },
        ],
      })
    );

    await expect(fetchWorkflowRuns("wf-1")).resolves.toEqual([
      {
        id: "run-1",
        workflowId: "wf-1",
        status: "completed",
        context: { "step-1": { status: "completed" } },
        startedAt: "2026-03-21 12:05:00",
        completedAt: "2026-03-21 12:06:00",
      },
    ]);
  });
});
