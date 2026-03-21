import { describe, it, expect, beforeEach } from "vitest";
import { useFlowStore } from "./flow-store.ts";

describe("FlowStore", () => {
  beforeEach(() => {
    // Reset store between tests
    useFlowStore.setState({
      particles: [],
      activeEdges: [],
      nodeGlows: new Map(),
      taskLog: [],
    });
  });

  describe("activateEdge", () => {
    it("adds a new active edge", () => {
      useFlowStore.getState().activateEdge({
        id: "relay-agent1",
        sourceAgent: "",
        targetAgent: "agent1",
        taskId: "task-1",
        active: true,
        status: "routing",
        activatedAt: Date.now(),
      });

      const edges = useFlowStore.getState().activeEdges;
      expect(edges).toHaveLength(1);
      expect(edges[0].targetAgent).toBe("agent1");
    });

    it("replaces edge with same taskId", () => {
      const store = useFlowStore.getState();
      store.activateEdge({
        id: "relay-agent1",
        sourceAgent: "",
        targetAgent: "agent1",
        taskId: "task-1",
        active: true,
        status: "routing",
        activatedAt: Date.now(),
      });
      store.activateEdge({
        id: "relay-agent1",
        sourceAgent: "",
        targetAgent: "agent1",
        taskId: "task-1",
        active: true,
        status: "working",
        activatedAt: Date.now(),
      });

      const edges = useFlowStore.getState().activeEdges;
      expect(edges).toHaveLength(1);
      expect(edges[0].status).toBe("working");
    });
  });

  describe("deactivateEdge", () => {
    it("removes edge by taskId", () => {
      useFlowStore.getState().activateEdge({
        id: "relay-agent1",
        sourceAgent: "",
        targetAgent: "agent1",
        taskId: "task-1",
        active: true,
        status: "working",
        activatedAt: Date.now(),
      });

      useFlowStore.getState().deactivateEdge("task-1");
      expect(useFlowStore.getState().activeEdges).toHaveLength(0);
    });
  });

  describe("setEdgeStatus", () => {
    it("updates status of edge by taskId", () => {
      useFlowStore.getState().activateEdge({
        id: "relay-agent1",
        sourceAgent: "",
        targetAgent: "agent1",
        taskId: "task-1",
        active: true,
        status: "routing",
        activatedAt: Date.now(),
      });

      useFlowStore.getState().setEdgeStatus("task-1", "success");
      expect(useFlowStore.getState().activeEdges[0].status).toBe("success");
    });
  });

  describe("setNodeGlow", () => {
    it("sets glow intensity for an agent", () => {
      useFlowStore.getState().setNodeGlow("agent1", "working");

      const glow = useFlowStore.getState().nodeGlows.get("agent1");
      expect(glow).toBeDefined();
      expect(glow!.intensity).toBe("working");
    });

    it("overwrites previous glow state", () => {
      const store = useFlowStore.getState();
      store.setNodeGlow("agent1", "working");
      store.setNodeGlow("agent1", "success");

      const glow = useFlowStore.getState().nodeGlows.get("agent1");
      expect(glow!.intensity).toBe("success");
    });
  });

  describe("addLogEntry", () => {
    it("prepends new entries (newest first)", () => {
      const store = useFlowStore.getState();
      store.addLogEntry({
        id: "log-1",
        timestamp: 1000,
        type: "task:created",
        taskId: "t1",
        message: "First",
      });
      store.addLogEntry({
        id: "log-2",
        timestamp: 2000,
        type: "task:routed",
        taskId: "t1",
        agentName: "agent1",
        message: "Second",
      });

      const log = useFlowStore.getState().taskLog;
      expect(log).toHaveLength(2);
      expect(log[0].id).toBe("log-2");
      expect(log[1].id).toBe("log-1");
    });

    it("caps at 200 entries", () => {
      const store = useFlowStore.getState();
      for (let i = 0; i < 210; i++) {
        store.addLogEntry({
          id: `log-${i}`,
          timestamp: i,
          type: "task:created",
          taskId: `t-${i}`,
          message: `Entry ${i}`,
        });
      }

      expect(useFlowStore.getState().taskLog).toHaveLength(200);
    });
  });

  describe("clearStaleAnimations", () => {
    it("removes edges older than 10 seconds", () => {
      useFlowStore.getState().activateEdge({
        id: "relay-agent1",
        sourceAgent: "",
        targetAgent: "agent1",
        taskId: "task-1",
        active: true,
        status: "working",
        activatedAt: Date.now() - 15_000, // 15 seconds ago
      });
      useFlowStore.getState().activateEdge({
        id: "relay-agent2",
        sourceAgent: "",
        targetAgent: "agent2",
        taskId: "task-2",
        active: true,
        status: "working",
        activatedAt: Date.now(), // just now
      });

      useFlowStore.getState().clearStaleAnimations();

      const edges = useFlowStore.getState().activeEdges;
      expect(edges).toHaveLength(1);
      expect(edges[0].taskId).toBe("task-2");
    });
  });

  describe("particles", () => {
    it("adds and removes particles", () => {
      const store = useFlowStore.getState();
      store.addParticle({
        id: "p1",
        edgeId: "relay-agent1",
        progress: 0,
        taskId: "task-1",
        status: "routing",
      });

      expect(useFlowStore.getState().particles).toHaveLength(1);

      store.removeParticle("p1");
      expect(useFlowStore.getState().particles).toHaveLength(0);
    });
  });
});
