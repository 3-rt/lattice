import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { clsx } from "clsx";
import { GitBranch } from "lucide-react";

export interface ConditionNodeData {
  label: string;
  field: string;
  operator: string;
  value?: string;
  stepStatus?: "pending" | "working" | "completed" | "failed" | "skipped";
  selected?: boolean;
}

export const ConditionNode = memo(function ConditionNode({
  data,
}: NodeProps) {
  const nodeData = data as unknown as ConditionNodeData;
  const status = nodeData.stepStatus;

  return (
    <div
      className={clsx(
        "w-48 rounded-lg border bg-gray-900 p-3 transition-all duration-300",
        !status && "border-amber-800/60",
        status === "pending" && "border-amber-800/60 opacity-60",
        status === "working" &&
          "border-amber-400 shadow-[0_0_16px_4px_rgba(251,191,36,0.3)]",
        status === "completed" &&
          "border-emerald-400 shadow-[0_0_12px_4px_rgba(52,211,153,0.3)]",
        status === "failed" &&
          "border-red-400 shadow-[0_0_12px_4px_rgba(248,113,113,0.3)]",
        status === "skipped" && "border-gray-700 opacity-40",
        nodeData.selected && "ring-2 ring-lattice-400"
      )}
    >
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 shrink-0 text-amber-400" />
        <span className="truncate text-xs font-semibold text-gray-100">
          {nodeData.label}
        </span>
      </div>

      <p className="mt-1 truncate text-[10px] text-gray-500">
        {nodeData.field} {nodeData.operator} {nodeData.value ?? ""}
      </p>

      <Handle
        type="target"
        position={Position.Top}
        className="!h-2.5 !w-2.5 !border-gray-500 !bg-gray-600"
      />
      <Handle
        id="default"
        type="source"
        position={Position.Bottom}
        className="!h-2.5 !w-2.5 !border-gray-500 !bg-gray-600"
      />
    </div>
  );
});
