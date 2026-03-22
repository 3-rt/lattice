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
        style={{ stroke: "rgba(107, 114, 128, 0.5)", strokeWidth: 2 }}
      />
      {mappingKeys.length > 0 && (
        <EdgeLabelRenderer>
          <div
            className="pointer-events-none absolute rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[9px] text-gray-400"
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
