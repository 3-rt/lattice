import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RelayClient } from "../src/lib/client.js";

describe("RelayClient", () => {
  let client: RelayClient;
  let originalFetch: typeof globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch;
    client = new RelayClient("http://localhost:3100");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should list agents", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ name: "claude-code", status: "online", card: {} }]),
    });

    const agents = await client.listAgents();
    expect(agents).toHaveLength(1);
    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3100/api/agents");
  });

  it("should create and execute a task", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ id: "task-1", status: "completed" }),
    });

    const task = await client.sendTask("fix the bug", "claude-code");
    expect(task.status).toBe("completed");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:3100/api/tasks",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "fix the bug", agent: "claude-code", execute: true }),
      })
    );
  });

  it("should list tasks", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ id: "t1", status: "completed" }]),
    });

    const tasks = await client.listTasks();
    expect(tasks).toHaveLength(1);
  });

  it("should get routing stats", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ agent_name: "claude-code", successes: 10, failures: 1 }]),
    });

    const stats = await client.getRoutingStats();
    expect(stats[0].agent_name).toBe("claude-code");
  });

  it("should throw on HTTP errors", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(client.listAgents()).rejects.toThrow("500");
  });
});
