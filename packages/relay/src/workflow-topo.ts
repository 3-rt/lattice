import type { WorkflowDefinition } from "./workflow-types.js";

/**
 * Kahn's algorithm — returns layers of node IDs that can execute in parallel.
 * Each layer's nodes have all dependencies satisfied by prior layers.
 * Throws if the graph contains a cycle.
 */
export function topoSort(def: WorkflowDefinition): string[][] {
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>(); // node -> nodes that depend on it

  for (const node of def.nodes) {
    inDegree.set(node.id, 0);
    dependents.set(node.id, []);
  }

  for (const edge of def.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
    dependents.get(edge.source)?.push(edge.target);
  }

  const layers: string[][] = [];
  let queue = def.nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id);
  let processed = 0;

  while (queue.length > 0) {
    layers.push([...queue]);
    processed += queue.length;

    const nextQueue: string[] = [];
    for (const nodeId of queue) {
      for (const dep of dependents.get(nodeId) ?? []) {
        const newDeg = (inDegree.get(dep) ?? 1) - 1;
        inDegree.set(dep, newDeg);
        if (newDeg === 0) {
          nextQueue.push(dep);
        }
      }
    }
    queue = nextQueue;
  }

  if (processed !== def.nodes.length) {
    throw new Error("Workflow graph contains a cycle");
  }

  return layers;
}
