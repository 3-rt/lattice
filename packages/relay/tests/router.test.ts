import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRouter } from "../src/router.js";
import { createRegistry } from "../src/registry.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import type { LatticeAdapter, AgentCard } from "@lattice/adapter-base";

function createMockAdapter(name: string, skillTags: string[]): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name}`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "skill-1", name: "Skill", description: "A skill", tags: skillTags }],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn(),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("Router", () => {
  let registry: ReturnType<typeof createRegistry>;
  let router: ReturnType<typeof createRouter>;

  beforeEach(() => {
    const db = createDatabase(":memory:");
    const bus = createEventBus();
    registry = createRegistry(db, bus);
    router = createRouter(registry);
  });

  it("should route to agent with best skill tag match", () => {
    registry.register(createMockAdapter("claude-code", ["code", "debug", "refactor"]));
    registry.register(createMockAdapter("openclaw", ["messaging", "telegram", "notify"]));
    const result = router.route("fix the bug and debug the code");
    expect(result.agentName).toBe("claude-code");
    expect(result.reason).toContain("skill match");
  });

  it("should route messaging tasks to openclaw", () => {
    registry.register(createMockAdapter("claude-code", ["code", "debug"]));
    registry.register(createMockAdapter("openclaw", ["messaging", "telegram", "notify"]));
    const result = router.route("send a telegram notify message");
    expect(result.agentName).toBe("openclaw");
  });

  it("should fall back to round-robin when no skills match", () => {
    registry.register(createMockAdapter("agent-a", ["cooking"]));
    registry.register(createMockAdapter("agent-b", ["gardening"]));
    const result = router.route("do something completely unrelated");
    expect(["agent-a", "agent-b"]).toContain(result.agentName);
    expect(result.reason).toContain("round-robin");
  });

  it("should respect explicit agent override", () => {
    registry.register(createMockAdapter("claude-code", ["code"]));
    registry.register(createMockAdapter("openclaw", ["messaging"]));
    const result = router.route("fix the code", "openclaw");
    expect(result.agentName).toBe("openclaw");
    expect(result.reason).toContain("explicit");
  });

  it("should throw if explicit agent is not registered", () => {
    registry.register(createMockAdapter("claude-code", ["code"]));
    expect(() => router.route("fix", "nonexistent")).toThrow("not found");
  });

  it("should break ties by registration order", () => {
    registry.register(createMockAdapter("first", ["code"]));
    registry.register(createMockAdapter("second", ["code"]));
    const result = router.route("write some code");
    expect(result.agentName).toBe("first");
  });
});
