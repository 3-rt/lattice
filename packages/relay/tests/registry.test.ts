import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRegistry } from "../src/registry.js";
import { createDatabase } from "../src/db.js";
import { createEventBus } from "../src/event-bus.js";
import type { LatticeAdapter, AgentCard } from "@lattice/adapter-base";

function createMockAdapter(name: string): LatticeAdapter {
  const card: AgentCard = {
    name,
    description: `Mock ${name} adapter`,
    url: `http://localhost:3100/a2a/agents/${name}`,
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    skills: [{ id: "coding", name: "Coding", description: "Write code", tags: ["code", "debug"] }],
    authentication: { schemes: [] },
  };
  return {
    getAgentCard: () => card,
    executeTask: vi.fn(),
    streamTask: vi.fn(),
    healthCheck: vi.fn().mockResolvedValue(true),
  };
}

describe("Registry", () => {
  let registry: ReturnType<typeof createRegistry>;
  let db: ReturnType<typeof createDatabase>;
  let bus: ReturnType<typeof createEventBus>;

  beforeEach(() => {
    db = createDatabase(":memory:");
    bus = createEventBus();
    registry = createRegistry(db, bus);
  });

  it("should register an adapter and emit event", () => {
    const handler = vi.fn();
    bus.on("agent:registered", handler);
    const adapter = createMockAdapter("claude-code");
    registry.register(adapter);
    expect(registry.listAgents()).toHaveLength(1);
    expect(registry.listAgents()[0].name).toBe("claude-code");
    expect(handler).toHaveBeenCalledOnce();
  });

  it("should deregister an adapter and emit event", () => {
    const handler = vi.fn();
    bus.on("agent:deregistered", handler);
    const adapter = createMockAdapter("claude-code");
    registry.register(adapter);
    registry.deregister("claude-code");
    expect(registry.listAgents()).toHaveLength(0);
    expect(handler).toHaveBeenCalledOnce();
  });

  it("should get adapter by name", () => {
    const adapter = createMockAdapter("claude-code");
    registry.register(adapter);
    expect(registry.getAdapter("claude-code")).toBe(adapter);
    expect(registry.getAdapter("nonexistent")).toBeUndefined();
  });

  it("should persist agents to database", () => {
    const adapter = createMockAdapter("claude-code");
    registry.register(adapter);
    const rows = db.listAgents();
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("claude-code");
  });

  it("should run health checks and emit status changes", async () => {
    const handler = vi.fn();
    bus.on("agent:status", handler);
    const adapter = createMockAdapter("claude-code");
    (adapter.healthCheck as ReturnType<typeof vi.fn>).mockResolvedValue(false);
    registry.register(adapter);
    await registry.runHealthChecks();
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: "agent:status", agentName: "claude-code", status: "offline" })
    );
  });
});
