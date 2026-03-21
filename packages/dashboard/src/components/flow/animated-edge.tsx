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
    routing: { stroke: "#4c6ef5", glow: "rgba(76, 110, 245, 0.6)" },
    working: { stroke: "#4c6ef5", glow: "rgba(76, 110, 245, 0.8)" },
    success: { stroke: "#34d399", glow: "rgba(52, 211, 153, 0.6)" },
    error: { stroke: "#f87171", glow: "rgba(248, 113, 113, 0.6)" },
  };

  const colors = colorMap[status];

  return (
    <>
      {/* Base dim edge (always visible) */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: "rgba(75, 85, 99, 0.3)",
          strokeWidth: 1.5,
        }}
      />

      {isActive && (
        <>
          {/* Glow layer behind the main stroke */}
          <path
            d={edgePath}
            fill="none"
            stroke={colors.glow}
            strokeWidth={8}
            strokeLinecap="round"
            className="animate-edge-pulse"
            style={{ filter: `blur(4px)` }}
          />

          {/* Main active stroke */}
          <path
            d={edgePath}
            fill="none"
            stroke={colors.stroke}
            strokeWidth={2.5}
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
