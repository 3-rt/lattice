import type { ConditionConfig, WorkflowContext, DataMapping, NodeOutput } from "./workflow-types.js";

/**
 * Resolves a dot-notation path against a single object.
 * Supports bracket notation for array access, e.g. "artifacts[0].parts[0].text"
 */
function resolveObjectPath(obj: unknown, path: string): string | undefined {
  const segments = path.replace(/\[(\d+)\]/g, ".$1").split(".");
  let current: unknown = obj;
  for (const seg of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current === "object") {
      current = (current as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  if (current === null || current === undefined) return undefined;
  return String(current);
}

/**
 * Resolves a dot-notation path (with bracket array access) against the workflow context.
 * The first segment is the node ID, the rest is the path within the node output.
 * Example: "n1.artifacts[0].parts[0].text"
 */
export function resolveContextValue(
  context: WorkflowContext,
  path: string
): string | undefined {
  const dotIndex = path.indexOf(".");
  if (dotIndex === -1) return undefined;
  const nodeId = path.slice(0, dotIndex);
  const rest = path.slice(dotIndex + 1);
  const nodeOutput = context[nodeId];
  if (!nodeOutput) return undefined;
  return resolveObjectPath(nodeOutput, rest);
}

/**
 * Evaluates a condition config against the workflow context.
 * All comparisons are string-based in v1.
 */
export function evaluateCondition(
  config: ConditionConfig,
  context: WorkflowContext
): boolean {
  const resolved = resolveContextValue(context, config.field);
  const fieldValue = resolved ?? "";

  switch (config.operator) {
    case "equals":
      return fieldValue === (config.value ?? "");
    case "not_equals":
      return fieldValue !== (config.value ?? "");
    case "contains":
      return fieldValue.includes(config.value ?? "");
    case "not_contains":
      return !fieldValue.includes(config.value ?? "");
    case "is_empty":
      return fieldValue === "";
    case "not_empty":
      return fieldValue !== "";
    default:
      return false;
  }
}

/**
 * Replaces {{variableName}} placeholders in a template string with values from data map.
 */
export function resolveTemplate(
  template: string,
  data: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return data[key] ?? "";
  });
}

/**
 * Applies edge data mapping: extracts fields from a source node's output
 * and returns a flat key-value map for the target node.
 */
export function applyDataMapping(
  sourceOutput: NodeOutput,
  mapping: DataMapping
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [sourcePath, targetKey] of Object.entries(mapping)) {
    const value = resolveObjectPath(sourceOutput, sourcePath);
    if (value !== undefined) {
      result[targetKey] = value;
    }
  }
  return result;
}
