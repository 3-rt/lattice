import { describe, it, expect } from "vitest";
import { topoSort } from "../src/workflow-topo.js";
import type { WorkflowDefinition } from "../src/workflow-types.js";

describe("topoSort", () => {
  it("should return single node in one layer", () => {
    const def: WorkflowDefinition = {
      nodes: [{ id: "a", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "do A" } }],
      edges: [],
    };
    const layers = topoSort(def);
    expect(layers).toEqual([["a"]]);
  });

  it("should return linear chain as sequential layers", () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "a", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "do A" } },
        { id: "b", type: "agent-task", label: "B", config: { agent: "auto", taskTemplate: "do B" } },
        { id: "c", type: "agent-task", label: "C", config: { agent: "auto", taskTemplate: "do C" } },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ],
    };
    const layers = topoSort(def);
    expect(layers).toEqual([["a"], ["b"], ["c"]]);
  });

  it("should group parallel branches in the same layer", () => {
    // a -> b, a -> c, b -> d, c -> d
    const def: WorkflowDefinition = {
      nodes: [
        { id: "a", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "do A" } },
        { id: "b", type: "agent-task", label: "B", config: { agent: "auto", taskTemplate: "do B" } },
        { id: "c", type: "agent-task", label: "C", config: { agent: "auto", taskTemplate: "do C" } },
        { id: "d", type: "agent-task", label: "D", config: { agent: "auto", taskTemplate: "do D" } },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "a", target: "c" },
        { source: "b", target: "d" },
        { source: "c", target: "d" },
      ],
    };
    const layers = topoSort(def);
    expect(layers).toEqual([["a"], expect.arrayContaining(["b", "c"]), ["d"]]);
    expect(layers[1]).toHaveLength(2);
  });

  it("should throw on cycle", () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "a", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "do A" } },
        { id: "b", type: "agent-task", label: "B", config: { agent: "auto", taskTemplate: "do B" } },
      ],
      edges: [
        { source: "a", target: "b" },
        { source: "b", target: "a" },
      ],
    };
    expect(() => topoSort(def)).toThrow("cycle");
  });

  it("should handle multiple roots", () => {
    const def: WorkflowDefinition = {
      nodes: [
        { id: "a", type: "agent-task", label: "A", config: { agent: "auto", taskTemplate: "do A" } },
        { id: "b", type: "agent-task", label: "B", config: { agent: "auto", taskTemplate: "do B" } },
        { id: "c", type: "agent-task", label: "C", config: { agent: "auto", taskTemplate: "do C" } },
      ],
      edges: [
        { source: "a", target: "c" },
        { source: "b", target: "c" },
      ],
    };
    const layers = topoSort(def);
    expect(layers[0]).toHaveLength(2);
    expect(layers[0]).toEqual(expect.arrayContaining(["a", "b"]));
    expect(layers[1]).toEqual(["c"]);
  });
});
