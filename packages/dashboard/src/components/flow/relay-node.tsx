import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Zap } from "lucide-react";

export interface RelayNodeData {
  label: string;
  taskCount: number;
}

export const RelayNode = memo(function RelayNode({
  data,
}: NodeProps & { data: RelayNodeData }) {
  return (
    <div className="relay-core relative flex h-24 w-24 items-center justify-center rounded-full border border-[var(--border-strong)] bg-slate-950/95 shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_60px_rgba(2,8,20,0.55)]">
      <div className="absolute inset-2 rounded-full border border-white/10 animate-breathe" />
      <div className="flex flex-col items-center gap-0.5 z-10">
        <Zap className="h-5 w-5 text-[var(--accent-primary-strong)]" />
        <span className="text-[9px] font-bold uppercase tracking-[0.26em] text-sky-100/85">
          {data.label}
        </span>
      </div>
      {data.taskCount > 0 && (
        <div className="task pulse absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-primary)] text-[9px] font-bold text-white shadow-[0_8px_20px_rgba(59,130,246,0.4)]">
          {data.taskCount}
        </div>
      )}
      {/* Invisible handles around the circle for edge connections */}
      <Handle type="source" position={Position.Top} className="!bg-transparent !border-none !w-0 !h-0" id="top" />
      <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-none !w-0 !h-0" id="bottom" />
      <Handle type="source" position={Position.Left} className="!bg-transparent !border-none !w-0 !h-0" id="left" />
      <Handle type="source" position={Position.Right} className="!bg-transparent !border-none !w-0 !h-0" id="right" />
    </div>
  );
});
