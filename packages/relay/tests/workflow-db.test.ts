import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createDatabase, type LatticeDB } from "../src/db.js";

describe("Workflow DB methods", () => {
  let db: LatticeDB;

  beforeEach(() => {
    db = createDatabase(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  describe("workflows", () => {
    it("should insert and retrieve a workflow", () => {
      const definition = {
        nodes: [{ id: "n1", type: "agent-task", label: "Step 1", config: { agent: "auto", taskTemplate: "do something" } }],
        edges: [],
      };
      db.insertWorkflow("wf-1", "Test Workflow", definition);
      const wf = db.getWorkflow("wf-1");

      expect(wf).toBeDefined();
      expect(wf!.id).toBe("wf-1");
      expect(wf!.name).toBe("Test Workflow");
      expect(JSON.parse(wf!.definition)).toEqual(definition);
    });

    it("should list all workflows", () => {
      const def = { nodes: [], edges: [] };
      db.insertWorkflow("wf-1", "First", def);
      db.insertWorkflow("wf-2", "Second", def);

      const workflows = db.listWorkflows();
      expect(workflows).toHaveLength(2);
    });

    it("should return undefined for missing workflow", () => {
      expect(db.getWorkflow("nonexistent")).toBeUndefined();
    });
  });

  describe("workflow_runs", () => {
    it("should insert and retrieve a workflow run", () => {
      const def = { nodes: [], edges: [] };
      db.insertWorkflow("wf-1", "Test", def);
      db.insertWorkflowRun("run-1", "wf-1");

      const run = db.getWorkflowRun("run-1");
      expect(run).toBeDefined();
      expect(run!.id).toBe("run-1");
      expect(run!.workflow_id).toBe("wf-1");
      expect(run!.status).toBe("pending");
    });

    it("should update a workflow run status and context", () => {
      const def = { nodes: [], edges: [] };
      db.insertWorkflow("wf-1", "Test", def);
      db.insertWorkflowRun("run-1", "wf-1");

      const context = { n1: { status: "completed", output: "done" } };
      db.updateWorkflowRun("run-1", { status: "running", context });

      const run = db.getWorkflowRun("run-1");
      expect(run!.status).toBe("running");
      expect(JSON.parse(run!.context!)).toEqual(context);
    });

    it("should update completed_at when status is completed", () => {
      const def = { nodes: [], edges: [] };
      db.insertWorkflow("wf-1", "Test", def);
      db.insertWorkflowRun("run-1", "wf-1");

      db.updateWorkflowRun("run-1", { status: "completed" });
      const run = db.getWorkflowRun("run-1");
      expect(run!.completed_at).toBeDefined();
    });

    it("should list runs for a specific workflow", () => {
      const def = { nodes: [], edges: [] };
      db.insertWorkflow("wf-1", "Test", def);
      db.insertWorkflow("wf-2", "Other", def);
      db.insertWorkflowRun("run-1", "wf-1");
      db.insertWorkflowRun("run-2", "wf-1");
      db.insertWorkflowRun("run-3", "wf-2");

      const runs = db.listWorkflowRuns("wf-1");
      expect(runs).toHaveLength(2);
      expect(runs.every((r) => r.workflow_id === "wf-1")).toBe(true);
    });

    it("should return undefined for missing run", () => {
      expect(db.getWorkflowRun("nonexistent")).toBeUndefined();
    });
  });
});
