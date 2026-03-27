import { memo } from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { useFlowStore } from "../../store/flow-store.ts";

export interface AnimatedEdgeData {
  taskId?: string;
}

export const AnimatedEdge = memo(function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps & { data?: AnimatedEdgeData }) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const activeEdge = useFlowStore((s) =>
    s.activeEdges.find((e) => e.id === id)
  );
  const isActive = activeEdge?.active ?? false;
  const status = activeEdge?.status ?? "routing";

  const colorMap = {
    routing: { stroke: "#60a5fa", glow: "rgba(96, 165, 250, 0.42)" },
    working: { stroke: "#93c5fd", glow: "rgba(147, 197, 253, 0.62)" },
    success: { stroke: "#34d399", glow: "rgba(52, 211, 153, 0.44)" },
    error: { stroke: "#fb7185", glow: "rgba(251, 113, 133, 0.42)" },
  };

  const colors = colorMap[status];

  return (
    <>
      {/* Base dim edge (always visible) */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: "rgba(148, 163, 184, 0.22)",
          strokeWidth: 1.75,
        }}
      />

      {isActive && (
        <>
          {/* Glow layer behind the main stroke */}
          <path
            d={edgePath}
            fill="none"
            stroke={colors.glow}
            strokeWidth={7}
            strokeLinecap="round"
            className="animate-edge-pulse"
            style={{ filter: `blur(4px)` }}
          />

          {/* Main active stroke */}
          <path
            d={edgePath}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={2.35}
            strokeLinecap="round"
            className="animate-edge-pulse"
          />

          {/* Traveling particle */}
          <circle r="4" fill={colors.stroke} className="flow-particle">
            <animateMotion
              dur="1.2s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>

          {/* Particle glow trail */}
          <circle r="8" fill={colors.glow} opacity="0.4">
            <animateMotion
              dur="1.2s"
              repeatCount="indefinite"
              path={edgePath}
            />
          </circle>
        </>
      )}
    </>
  );
});
