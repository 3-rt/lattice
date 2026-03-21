import { describe, it, expect, vi } from "vitest";
import { createEventBus } from "../src/event-bus.js";

describe("EventBus", () => {
  it("should emit and receive events", () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.on("task:created", handler);
    bus.emit({ type: "task:created", task: { id: "t1" } as any });

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ type: "task:created", task: { id: "t1" } });
  });

  it("should support wildcard listeners", () => {
    const bus = createEventBus();
    const handler = vi.fn();

    bus.onAny(handler);
    bus.emit({ type: "task:created", task: { id: "t1" } as any });
    bus.emit({ type: "agent:registered", agent: {} as any });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it("should maintain a ring buffer of recent events", () => {
    const bus = createEventBus(3);
    bus.emit({ type: "agent:status", agentName: "a", status: "online" });
    bus.emit({ type: "agent:status", agentName: "b", status: "online" });
    bus.emit({ type: "agent:status", agentName: "c", status: "online" });
    bus.emit({ type: "agent:status", agentName: "d", status: "online" });

    const buffered = bus.getBufferedEvents();
    expect(buffered).toHaveLength(3);
    expect(buffered[0].event.agentName).toBe("b");
  });

  it("should assign incrementing IDs to events", () => {
    const bus = createEventBus();
    bus.emit({ type: "agent:status", agentName: "a", status: "online" });
    bus.emit({ type: "agent:status", agentName: "b", status: "online" });

    const buffered = bus.getBufferedEvents();
    expect(buffered[0].id).toBe(1);
    expect(buffered[1].id).toBe(2);
  });

  it("should return events after a given ID", () => {
    const bus = createEventBus();
    bus.emit({ type: "agent:status", agentName: "a", status: "online" });
    bus.emit({ type: "agent:status", agentName: "b", status: "online" });
    bus.emit({ type: "agent:status", agentName: "c", status: "online" });

    const after = bus.getBufferedEventsAfter(1);
    expect(after).toHaveLength(2);
    expect(after[0].id).toBe(2);
  });
});
