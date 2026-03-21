import { describe, it, expect } from "vitest";
import { evaluateCondition, resolveContextValue } from "../src/workflow-condition.js";
import type { ConditionConfig, WorkflowContext } from "../src/workflow-types.js";

describe("resolveContextValue", () => {
  const context: WorkflowContext = {
    n1: {
      status: "completed",
      result: "Bug found in auth module",
      artifacts: [{ name: "output", parts: [{ type: "text", text: "fixed the bug" }] }],
    },
    n2: {
      status: "failed",
      result: "",
    },
  };

  it("should resolve a top-level field", () => {
    expect(resolveContextValue(context, "n1.status")).toBe("completed");
  });

  it("should resolve a nested field", () => {
    expect(resolveContextValue(context, "n1.result")).toBe("Bug found in auth module");
  });

  it("should resolve array-indexed field with bracket notation", () => {
    expect(resolveContextValue(context, "n1.artifacts[0].parts[0].text")).toBe("fixed the bug");
  });

  it("should return undefined for missing path", () => {
    expect(resolveContextValue(context, "n1.nonexistent")).toBeUndefined();
  });

  it("should return undefined for missing node", () => {
    expect(resolveContextValue(context, "n99.status")).toBeUndefined();
  });
});

describe("evaluateCondition", () => {
  const context: WorkflowContext = {
    n1: { status: "completed", result: "Bug found in auth module" },
    n2: { status: "completed", result: "" },
  };

  it("equals: true when values match", () => {
    const config: ConditionConfig = { field: "n1.status", operator: "equals", value: "completed" };
    expect(evaluateCondition(config, context)).toBe(true);
  });

  it("equals: false when values differ", () => {
    const config: ConditionConfig = { field: "n1.status", operator: "equals", value: "failed" };
    expect(evaluateCondition(config, context)).toBe(false);
  });

  it("not_equals: true when values differ", () => {
    const config: ConditionConfig = { field: "n1.status", operator: "not_equals", value: "failed" };
    expect(evaluateCondition(config, context)).toBe(true);
  });

  it("contains: true when field contains value", () => {
    const config: ConditionConfig = { field: "n1.result", operator: "contains", value: "auth" };
    expect(evaluateCondition(config, context)).toBe(true);
  });

  it("contains: false when field does not contain value", () => {
    const config: ConditionConfig = { field: "n1.result", operator: "contains", value: "database" };
    expect(evaluateCondition(config, context)).toBe(false);
  });

  it("not_contains: true when field does not contain value", () => {
    const config: ConditionConfig = { field: "n1.result", operator: "not_contains", value: "database" };
    expect(evaluateCondition(config, context)).toBe(true);
  });

  it("is_empty: true for empty string", () => {
    const config: ConditionConfig = { field: "n2.result", operator: "is_empty" };
    expect(evaluateCondition(config, context)).toBe(true);
  });

  it("is_empty: false for non-empty string", () => {
    const config: ConditionConfig = { field: "n1.result", operator: "is_empty" };
    expect(evaluateCondition(config, context)).toBe(false);
  });

  it("not_empty: true for non-empty string", () => {
    const config: ConditionConfig = { field: "n1.result", operator: "not_empty" };
    expect(evaluateCondition(config, context)).toBe(true);
  });

  it("is_empty: true for missing field", () => {
    const config: ConditionConfig = { field: "n1.nonexistent", operator: "is_empty" };
    expect(evaluateCondition(config, context)).toBe(true);
  });
});
