// packages/relay/tests/learned-router.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLearnedRouter } from "../src/learned-router.js";
import { createRegistry } from "../src/registry.js";
import { createDatabase, type LatticeDB } from "../src/db.js";
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

describe("LearnedRouter", () => {
  let db: LatticeDB;
  let registry: ReturnType<typeof createRegistry>;

  beforeEach(() => {
    db = createDatabase(":memory:");
    const bus = createEventBus();
    registry = createRegistry(db, bus);
  });

  afterEach(() => {
    db.close();
  });

  it("should still respect explicit agent override", () => {
    registry.register(createMockAdapter("agent-a", ["code"]));
    registry.register(createMockAdapter("agent-b", ["code"]));
    const router = createLearnedRouter(registry, db, { seed: 42 });
    const result = router.route("fix the code", "agent-b");
    expect(result.agentName).toBe("agent-b");
    expect(result.reason).toContain("explicit");
  });

  it("should throw when no agents are online", () => {
    const router = createLearnedRouter(registry, db, { seed: 42 });
    expect(() => router.route("do something")).toThrow("No agents available");
  });

  it("should use round-robin when no stats exist (cold start)", () => {
    registry.register(createMockAdapter("agent-a", ["code"]));
    registry.register(createMockAdapter("agent-b", ["code"]));
    const router = createLearnedRouter(registry, db, { seed: 42 });
    const result = router.route("do something with no category match and no stats");
    expect(["agent-a", "agent-b"]).toContain(result.agentName);
    // With no stats at all, it should fall back
    expect(result.reason).toContain("thompson sampling");
  });

  it("should favor the agent with more successes in a category", () => {
    registry.register(createMockAdapter("good-agent", ["code"]));
    registry.register(createMockAdapter("bad-agent", ["code"]));

    // Seed good-agent with 50 successes in "debugging"
    for (let i = 0; i < 50; i++) {
      db.updateRoutingStats("good-agent", "debugging", true, 100, 0);
    }
    // Seed bad-agent with 50 failures in "debugging"
    for (let i = 0; i < 50; i++) {
      db.updateRoutingStats("bad-agent", "debugging", false, 100, 0);
    }

    // Route many debugging tasks and check the good agent wins most
    let goodCount = 0;
    for (let s = 0; s < 100; s++) {
      const router = createLearnedRouter(registry, db, { seed: s });
      const result = router.route("fix the bug");
      if (result.agentName === "good-agent") goodCount++;
    }
    // good-agent should win the vast majority (Beta(51,1) vs Beta(1,51))
    expect(goodCount).toBeGreaterThan(90);
  });

  it("should include category in the routing reason", () => {
    registry.register(createMockAdapter("agent-a", ["code"]));
    db.updateRoutingStats("agent-a", "debugging", true, 100, 0);
    const router = createLearnedRouter(registry, db, { seed: 42 });
    const result = router.route("fix the bug");
    expect(result.reason).toContain("debugging");
    expect(result.reason).toContain("thompson sampling");
  });

  it("should handle single agent gracefully", () => {
    registry.register(createMockAdapter("only-agent", ["code"]));
    const router = createLearnedRouter(registry, db, { seed: 42 });
    const result = router.route("fix the bug");
    expect(result.agentName).toBe("only-agent");
  });

  it("should use different categories for different task types", () => {
    registry.register(createMockAdapter("debugger", ["code"]));
    registry.register(createMockAdapter("writer", ["code"]));

    // debugger is great at debugging, writer is great at code-generation
    for (let i = 0; i < 30; i++) {
      db.updateRoutingStats("debugger", "debugging", true, 100, 0);
      db.updateRoutingStats("writer", "debugging", false, 100, 0);
      db.updateRoutingStats("writer", "code-generation", true, 100, 0);
      db.updateRoutingStats("debugger", "code-generation", false, 100, 0);
    }

    let debuggerWinsDebug = 0;
    let writerWinsGen = 0;
    for (let s = 0; s < 50; s++) {
      const router = createLearnedRouter(registry, db, { seed: s });
      if (router.route("fix the error").agentName === "debugger") debuggerWinsDebug++;
      if (router.route("write a new feature").agentName === "writer") writerWinsGen++;
    }
    expect(debuggerWinsDebug).toBeGreaterThan(40);
    expect(writerWinsGen).toBeGreaterThan(40);
  });
});
