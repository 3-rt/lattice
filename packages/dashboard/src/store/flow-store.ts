import { create } from "zustand";

export interface FlowParticle {
  id: string;
  edgeId: string;
  progress: number; // 0 to 1
  taskId: string;
  status: "routing" | "success" | "error";
}

export interface ActiveEdge {
  id: string;
  sourceAgent: string; // "" for relay
  targetAgent: string;
  taskId: string;
  active: boolean;
  status: "routing" | "working" | "success" | "error";
  activatedAt: number;
}

export interface NodeGlow {
  agentName: string;
  intensity: "idle" | "working" | "success" | "error";
  lastUpdated: number;
}

export interface TaskLogEntry {
  id: string;
  timestamp: number;
  type: string;
  taskId: string;
  agentName?: string;
  message: string;
}

interface FlowState {
  particles: FlowParticle[];
  activeEdges: ActiveEdge[];
  nodeGlows: Map<string, NodeGlow>;
  taskLog: TaskLogEntry[];

  // Actions
  activateEdge: (edge: ActiveEdge) => void;
  deactivateEdge: (taskId: string) => void;
  setEdgeStatus: (taskId: string, status: ActiveEdge["status"]) => void;
  addParticle: (particle: FlowParticle) => void;
  removeParticle: (id: string) => void;
  setNodeGlow: (agentName: string, intensity: NodeGlow["intensity"]) => void;
  addLogEntry: (entry: TaskLogEntry) => void;
  clearStaleAnimations: () => void;
}

const MAX_LOG_ENTRIES = 200;
const STALE_EDGE_MS = 10_000;

export const useFlowStore = create<FlowState>((set) => ({
  particles: [],
  activeEdges: [],
  nodeGlows: new Map(),
  taskLog: [],

  activateEdge: (edge) =>
    set((state) => ({
      activeEdges: [
        ...state.activeEdges.filter((e) => e.taskId !== edge.taskId),
        edge,
      ],
    })),

  deactivateEdge: (taskId) =>
    set((state) => ({
      activeEdges: state.activeEdges.filter((e) => e.taskId !== taskId),
    })),

  setEdgeStatus: (taskId, status) =>
    set((state) => ({
      activeEdges: state.activeEdges.map((e) =>
        e.taskId === taskId ? { ...e, status } : e
      ),
    })),

  addParticle: (particle) =>
    set((state) => ({ particles: [...state.particles, particle] })),

  removeParticle: (id) =>
    set((state) => ({
      particles: state.particles.filter((p) => p.id !== id),
    })),

  setNodeGlow: (agentName, intensity) =>
    set((state) => {
      const next = new Map(state.nodeGlows);
      next.set(agentName, { agentName, intensity, lastUpdated: Date.now() });
      return { nodeGlows: next };
    }),

  addLogEntry: (entry) =>
    set((state) => ({
      taskLog: [entry, ...state.taskLog].slice(0, MAX_LOG_ENTRIES),
    })),

  clearStaleAnimations: () =>
    set((state) => {
      const now = Date.now();
      return {
        activeEdges: state.activeEdges.filter(
          (e) => now - e.activatedAt < STALE_EDGE_MS
        ),
      };
    }),
}));
