import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
  ConnectionMode,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import { useLatticeStore } from "../../store/lattice-store.ts";
import { useFlowStore } from "../../store/flow-store.ts";
import { RelayNode, type RelayNodeData } from "./relay-node.tsx";
import { AgentNode, type AgentNodeData } from "./agent-node.tsx";
import { AnimatedEdge } from "./animated-edge.tsx";
import { FlowEmptyState } from "./empty-state.tsx";

const nodeTypes = {
  relay: RelayNode,
  agent: AgentNode,
};

const edgeTypes = {
  animated: AnimatedEdge,
};

const RADIUS = 250;
const CENTER_X = 0;
const CENTER_Y = 0;

/**
 * Compute radial positions for N agents around a center point.
 * Start from the top (-PI/2) and distribute evenly.
 */
function radialLayout(count: number): Array<{ x: number; y: number }> {
  if (count === 0) return [];
  const startAngle = -Math.PI / 2;
  const step = (2 * Math.PI) / count;
  return Array.from({ length: count }, (_, i) => ({
    x: CENTER_X + RADIUS * Math.cos(startAngle + i * step),
    y: CENTER_Y + RADIUS * Math.sin(startAngle + i * step),
  }));
}

/**
 * Pick the best handle pair for an edge based on agent position relative to relay.
 */
function pickHandles(agentX: number, agentY: number): { source: string; target: string } {
  const angle = Math.atan2(agentY - CENTER_Y, agentX - CENTER_X);
  const deg = (angle * 180) / Math.PI;

  if (deg >= -45 && deg < 45) return { source: "right", target: "left" };
  if (deg >= 45 && deg < 135) return { source: "bottom", target: "top" };
  if (deg >= -135 && deg < -45) return { source: "top", target: "bottom" };
  return { source: "left", target: "right" };
}

export function FlowCanvas() {
  const agents = useLatticeStore((s) => s.agents);
  const tasks = useLatticeStore((s) => s.tasks);
  const activeEdges = useFlowStore((s) => s.activeEdges);

  const activeTasks = tasks.filter(
    (t) => t.status === "working" || t.status === "submitted"
  );

  const { nodes, edges } = useMemo(() => {
    if (agents.length === 0) return { nodes: [], edges: [] };

    const positions = radialLayout(agents.length);

    const relayNode: Node = {
      id: "relay",
      type: "relay",
      position: { x: CENTER_X - 40, y: CENTER_Y - 40 }, // offset for node center
      data: {
        label: "Relay",
        taskCount: activeTasks.length,
      } satisfies RelayNodeData,
      draggable: false,
      selectable: false,
    };

    const agentNodes: Node[] = agents.map((agent, i) => ({
      id: `agent-${agent.name}`,
      type: "agent",
      position: { x: positions[i].x - 88, y: positions[i].y - 40 }, // offset for node center (w-44/2, estimated h/2)
      data: {
        agentName: agent.name,
        description: agent.card.description,
        status: agent.status,
        skills: agent.card.skills.map((s) => s.name),
      } satisfies AgentNodeData,
      draggable: true,
      selectable: false,
    }));

    const edgeList: Edge[] = agents.map((agent, i) => {
      const handles = pickHandles(positions[i].x, positions[i].y);
      return {
        id: `relay-${agent.name}`,
        source: "relay",
        target: `agent-${agent.name}`,
        sourceHandle: handles.source,
        targetHandle: handles.target,
        type: "animated",
        data: {},
      };
    });

    return { nodes: [relayNode, ...agentNodes], edges: edgeList };
  }, [agents, activeTasks.length]);

  if (agents.length === 0) {
    return <FlowEmptyState />;
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="rgba(75, 85, 99, 0.15)"
        />
      </ReactFlow>
    </div>
  );
}
