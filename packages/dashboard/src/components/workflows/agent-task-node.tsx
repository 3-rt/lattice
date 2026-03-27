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
        "workflow-node-shell w-56 rounded-[1rem] border bg-slate-950/95 p-3.5 transition-all duration-300",
        !status && "border-white/10",
        status === "pending" && "border-white/10 opacity-70",
        status === "working" &&
          "border-[var(--accent-primary)] shadow-[0_0_16px_4px_rgba(96,165,250,0.28)]",
        status === "completed" &&
          "border-emerald-400 shadow-[0_0_12px_4px_rgba(52,211,153,0.3)]",
        status === "failed" &&
          "border-rose-400 shadow-[0_0_12px_4px_rgba(248,113,113,0.3)]",
        status === "skipped" && "border-white/10 opacity-40",
        nodeData.selected && "ring-2 ring-[var(--accent-primary)]"
      )}
    >
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-[var(--accent-primary-strong)]" />
        <span className="truncate text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-strong)]">
          {nodeData.label}
        </span>
      </div>

      <p className="mt-2 truncate text-[10px] text-[var(--text-muted)]">
        Agent: {nodeData.agent || "auto"}
      </p>
      <p className="mt-1 truncate text-[10px] text-[var(--text-soft)]">
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
