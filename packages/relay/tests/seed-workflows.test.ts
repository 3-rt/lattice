import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDatabase } from "../src/db.js";
import { seedWorkflows } from "../src/seed-workflows.js";

describe("seedWorkflows", () => {
  let tmpDir: string;
  let workflowDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "lattice-seed-"));
    workflowDir = path.join(tmpDir, "workflows");
    fs.mkdirSync(workflowDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeWorkflow(filename: string, content: Record<string, unknown>) {
    fs.writeFileSync(path.join(workflowDir, filename), JSON.stringify(content));
  }

  it("loads valid workflow JSON files into the database", () => {
    const db = createDatabase(":memory:");
    writeWorkflow("test.json", {
      name: "Test Workflow",
      definition: { nodes: [], edges: [] },
    });

    const result = seedWorkflows(db, workflowDir);

    expect(result).toEqual({ loaded: 1, skipped: 0, errors: [] });
    expect(db.listWorkflows()).toHaveLength(1);
    expect(db.listWorkflows()[0].name).toBe("Test Workflow");
  });

  it("skips workflows that already exist by name", () => {
    const db = createDatabase(":memory:");
    writeWorkflow("test.json", {
      name: "Existing",
      definition: { nodes: [], edges: [] },
    });

    seedWorkflows(db, workflowDir);
    const result = seedWorkflows(db, workflowDir);

    expect(result.loaded).toBe(0);
    expect(result.skipped).toBe(1);
    expect(db.listWorkflows()).toHaveLength(1);
  });

  it("reports malformed workflow JSON", () => {
    const db = createDatabase(":memory:");
    fs.writeFileSync(path.join(workflowDir, "bad.json"), "not json");

    const result = seedWorkflows(db, workflowDir);

    expect(result.loaded).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("bad.json");
  });

  it("reports missing required workflow fields", () => {
    const db = createDatabase(":memory:");
    writeWorkflow("missing-name.json", { definition: { nodes: [], edges: [] } });

    const result = seedWorkflows(db, workflowDir);

    expect(result.loaded).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("missing-name.json");
  });

  it("returns an empty result for a missing workflow directory", () => {
    const db = createDatabase(":memory:");

    expect(seedWorkflows(db, path.join(tmpDir, "does-not-exist"))).toEqual({
      loaded: 0,
      skipped: 0,
      errors: [],
    });
  });

  it("loads multiple workflows and ignores non-json files", () => {
    const db = createDatabase(":memory:");
    writeWorkflow("a.json", { name: "A", definition: { nodes: [], edges: [] } });
    writeWorkflow("b.json", { name: "B", definition: { nodes: [], edges: [] } });
    fs.writeFileSync(path.join(workflowDir, "notes.txt"), "ignore me");

    const result = seedWorkflows(db, workflowDir);

    expect(result.loaded).toBe(2);
    expect(result.errors).toHaveLength(0);
    expect(db.listWorkflows()).toHaveLength(2);
  });
});
