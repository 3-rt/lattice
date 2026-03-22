import { describe, expect, it } from "vitest";
import type { TaskInfo } from "../../lib/api.ts";
import {
  filterTasks,
  getRoutingStatsSummary,
  getTaskInputText,
  getTaskOutputText,
} from "./task-utils.ts";

function makeTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
  return {
    id: "task-1",
    status: "submitted",
    artifacts: [],
    history: [],
    metadata: {
      createdAt: "2026-03-21T12:00:00.000Z",
      updatedAt: "2026-03-21T12:00:00.000Z",
      assignedAgent: "",
      routingReason: "",
      latencyMs: 0,
    },
    ...overrides,
  };
}

describe("task-utils", () => {
  it("extracts only user text from task history", () => {
    const task = makeTask({
      history: [
        {
          role: "user",
          parts: [
            { type: "text", text: "Investigate routing failures" },
            { type: "image", text: "ignored" },
          ],
        },
        {
          role: "assistant",
          parts: [{ type: "text", text: "ignored output" }],
        },
        {
          role: "user",
          parts: [{ type: "text", text: "Need a summary too" }],
        },
      ],
    });

    expect(getTaskInputText(task)).toBe(
      "Investigate routing failures\nNeed a summary too"
    );
  });

  it("extracts text output from task artifacts", () => {
    const task = makeTask({
      artifacts: [
        {
          name: "result",
          parts: [
            { type: "text", text: "Patched auth.ts" },
            { type: "binary", text: "ignored" },
          ],
        },
        {
          name: "summary",
          parts: [{ type: "text", text: "Tests passing" }],
        },
      ],
    });

    expect(getTaskOutputText(task)).toBe("Patched auth.ts\nTests passing");
  });

  it("filters tasks by status and assigned agent", () => {
    const tasks = [
      makeTask({
        id: "task-1",
        status: "working",
        metadata: {
          createdAt: "2026-03-21T12:00:00.000Z",
          updatedAt: "2026-03-21T12:00:00.000Z",
          assignedAgent: "claude-code",
          routingReason: "",
          latencyMs: 0,
        },
      }),
      makeTask({
        id: "task-2",
        status: "completed",
        metadata: {
          createdAt: "2026-03-21T12:00:00.000Z",
          updatedAt: "2026-03-21T12:00:00.000Z",
          assignedAgent: "codex",
          routingReason: "",
          latencyMs: 0,
        },
      }),
    ];

    expect(filterTasks(tasks, "working", "claude-code")).toEqual([tasks[0]]);
    expect(filterTasks(tasks, "", "codex")).toEqual([tasks[1]]);
  });

  it("computes routing stat totals, success rate, and average latency", () => {
    expect(
      getRoutingStatsSummary({
        agent_name: "claude-code",
        category: "coding",
        successes: 9,
        failures: 1,
        total_latency_ms: 18750,
        total_cost: 1.5,
        updated_at: "2026-03-21T12:00:00.000Z",
      })
    ).toEqual({
      total: 10,
      successRate: 90,
      averageLatencyMs: 1875,
    });
  });
});
