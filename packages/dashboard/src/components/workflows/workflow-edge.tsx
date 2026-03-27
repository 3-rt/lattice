import { memo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";

export interface WorkflowEdgeData {
  dataMapping?: Record<string, string>;
}

export const WorkflowEdge = memo(function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const edgeData = data as WorkflowEdgeData | undefined;
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const mappingKeys = edgeData?.dataMapping
    ? Object.keys(edgeData.dataMapping)
    : [];

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: selected ? "rgba(96, 165, 250, 0.72)" : "rgba(148, 163, 184, 0.42)",
          strokeWidth: selected ? 2.5 : 1.75,
        }}
      />
      {mappingKeys.length > 0 && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded-full border border-white/8 bg-slate-900/95 px-2 py-0.5 text-[9px] text-[var(--text-muted)]"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {mappingKeys.length} mapping{mappingKeys.length > 1 ? "s" : ""}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
