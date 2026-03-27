import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { clsx } from "clsx";
import { Bot } from "lucide-react";

export interface AgentTaskNodeData {
  label: string;
  agent: string;
  taskTemplate: string;
  stepStatus?: "pending" | "working" | "completed" | "failed" | "skipped";
  selected?: boolean;
}

export const AgentTaskNode = memo(function AgentTaskNode({
  data,
}: NodeProps) {
  const nodeData = data as unknown as AgentTaskNodeData;
  const status = nodeData.stepStatus;

  return (
    <div
      className={clsx(
        "w-52 rounded-lg border bg-gray-900 p-3 transition-all duration-300",
        !status && "border-gray-700",
        status === "pending" && "border-gray-700 opacity-60",
        status === "working" &&
          "border-lattice-500 shadow-[0_0_16px_4px_rgba(76,110,245,0.4)]",
        status === "completed" &&
          "border-emerald-400 shadow-[0_0_12px_4px_rgba(52,211,153,0.3)]",
        status === "failed" &&
          "border-red-400 shadow-[0_0_12px_4px_rgba(248,113,113,0.3)]",
        status === "skipped" && "border-gray-700 opacity-40",
        nodeData.selected && "ring-2 ring-lattice-400"
      )}
    >
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-lattice-400" />
        <span className="truncate text-xs font-semibold text-gray-100">
          {nodeData.label}
        </span>
      </div>

      <p className="mt-1 truncate text-[10px] text-gray-500">
        Agent: {nodeData.agent || "auto"}
      </p>
      <p className="mt-0.5 truncate text-[10px] text-gray-600">
        {nodeData.taskTemplate || "No template"}
      </p>

      <Handle
        type="target"
        position={Position.Top}
        className="!h-3 !w-3 !border-gray-500 !bg-gray-600 hover:!bg-lattice-400"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-3 !w-3 !border-gray-500 !bg-gray-600 hover:!bg-lattice-400"
      />
    </div>
  );
});
