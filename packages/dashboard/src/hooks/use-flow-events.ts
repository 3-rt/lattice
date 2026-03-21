import { useEffect, useRef } from "react";
import { useLatticeStore } from "../store/lattice-store.ts";
import { useFlowStore, type TaskLogEntry } from "../store/flow-store.ts";

/**
 * Subscribes to the Lattice store and drives flow animation state.
 * Must be mounted inside the flow page.
 */
export function useFlowEvents() {
  const tasks = useLatticeStore((s) => s.tasks);
  const agents = useLatticeStore((s) => s.agents);

  const activateEdge = useFlowStore((s) => s.activateEdge);
  const deactivateEdge = useFlowStore((s) => s.deactivateEdge);
  const setEdgeStatus = useFlowStore((s) => s.setEdgeStatus);
  const setNodeGlow = useFlowStore((s) => s.setNodeGlow);
  const addLogEntry = useFlowStore((s) => s.addLogEntry);
  const clearStaleAnimations = useFlowStore((s) => s.clearStaleAnimations);

  const prevTasksRef = useRef<typeof tasks>([]);
  const logIdCounter = useRef(0);

  // Garbage-collect stale edges every 5 seconds
  useEffect(() => {
    const interval = setInterval(clearStaleAnimations, 5000);
    return () => clearInterval(interval);
  }, [clearStaleAnimations]);

  // Diff tasks to detect state transitions
  useEffect(() => {
    const prev = prevTasksRef.current;
    const prevMap = new Map(prev.map((t) => [t.id, t]));

    for (const task of tasks) {
      const old = prevMap.get(task.id);
      const oldStatus = old?.status;
      const newStatus = task.status;

      if (oldStatus === newStatus) continue;

      const agentName = task.metadata?.assignedAgent ?? "";
      const edgeId = agentName ? `relay-${agentName}` : "";

      function log(type: string, message: string) {
        logIdCounter.current += 1;
        const entry: TaskLogEntry = {
          id: `log-${logIdCounter.current}`,
          timestamp: Date.now(),
          type,
          taskId: task.id,
          agentName: agentName || undefined,
          message,
        };
        addLogEntry(entry);
      }

      // New task created
      if (!old && newStatus) {
        log("task:created", `Task created: "${truncate(taskText(task), 60)}"`);
        setNodeGlow("__relay__", "working");
        // Reset relay glow after brief highlight
        setTimeout(() => setNodeGlow("__relay__", "idle"), 2000);
      }

      // Task routed to agent
      if (newStatus === "working" && oldStatus !== "working" && agentName) {
        log(
          "task:routed",
          `Routed to ${agentName}${task.metadata?.routingReason ? ` (${task.metadata.routingReason})` : ""}`
        );
        activateEdge({
          id: edgeId,
          sourceAgent: "",
          targetAgent: agentName,
          taskId: task.id,
          active: true,
          status: "working",
          activatedAt: Date.now(),
        });
        setNodeGlow(agentName, "working");
      }

      // Task completed
      if (newStatus === "completed" && oldStatus !== "completed") {
        log("task:completed", `Completed by ${agentName || "unknown"}`);
        if (agentName) {
          setEdgeStatus(task.id, "success");
          setNodeGlow(agentName, "success");
          // Fade out after 3 seconds
          setTimeout(() => {
            deactivateEdge(task.id);
            setNodeGlow(agentName, "idle");
          }, 3000);
        }
      }

      // Task failed
      if (newStatus === "failed" && oldStatus !== "failed") {
        log("task:failed", `Failed${agentName ? ` on ${agentName}` : ""}`);
        if (agentName) {
          setEdgeStatus(task.id, "error");
          setNodeGlow(agentName, "error");
          setTimeout(() => {
            deactivateEdge(task.id);
            setNodeGlow(agentName, "idle");
          }, 3000);
        }
      }

      // Task canceled
      if (newStatus === "canceled" && oldStatus !== "canceled") {
        log("task:canceled", `Canceled`);
        deactivateEdge(task.id);
        if (agentName) setNodeGlow(agentName, "idle");
      }
    }

    prevTasksRef.current = tasks;
  }, [
    tasks,
    activateEdge,
    deactivateEdge,
    setEdgeStatus,
    setNodeGlow,
    addLogEntry,
  ]);

  return { agents, tasks };
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + "\u2026" : str;
}

function taskText(task: { history?: Array<{ parts: Array<{ text?: string }> }> }): string {
  const firstMsg = task.history?.[0]?.parts?.[0]?.text;
  return firstMsg ?? "(no message)";
}
