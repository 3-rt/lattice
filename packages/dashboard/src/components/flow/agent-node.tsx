import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { clsx } from "clsx";
import { Bot } from "lucide-react";
import { useFlowStore } from "../../store/flow-store.ts";

export interface AgentNodeData {
  agentName: string;
  description: string;
  status: string;
  skills: string[];
}

export const AgentNode = memo(function AgentNode({
  data,
}: NodeProps & { data: AgentNodeData }) {
  const glow = useFlowStore((s) => s.nodeGlows.get(data.agentName));
  const isOnline = data.status === "online";
  const intensity = glow?.intensity ?? "idle";

  return (
    <div
      className={clsx(
        "mission-node relative w-48 overflow-hidden rounded-[1.1rem] border p-3.5 transition-all duration-300",
        !isOnline && "border-white/6 bg-slate-900/70 opacity-55",
        isOnline && intensity === "idle" && "animate-breathe border-slate-300/18 bg-slate-950/90",
        isOnline && intensity === "working" && "animate-glow-working border-[var(--accent-primary)] bg-slate-950/95",
        isOnline && intensity === "success" && "animate-glow-success border-emerald-400 bg-slate-950/95",
        isOnline && intensity === "error" && "animate-glow-error border-rose-400 bg-slate-950/95"
      )}
    >
      <div className="absolute inset-x-3 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-[var(--accent-primary-strong)]" />
        <span className="truncate text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-strong)]">
          {data.agentName}
        </span>
        <div
          className={clsx(
            "mission-node-status ml-auto h-2.5 w-2.5 rounded-full shrink-0",
            isOnline ? "bg-emerald-400" : "bg-gray-600"
          )}
        />
      </div>

      <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-[var(--text-muted)]">
        {data.description}
      </p>

      {data.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="rounded-full border border-white/8 bg-white/6 px-1.5 py-0.5 text-[9px] text-[var(--text-muted)]"
            >
              {skill}
            </span>
          ))}
          {data.skills.length > 3 && (
            <span className="text-[9px] text-[var(--text-soft)]">
              +{data.skills.length - 3}
            </span>
          )}
        </div>
      )}

      <Handle type="target" position={Position.Top} className="!bg-transparent !border-none !w-0 !h-0" id="top" />
      <Handle type="target" position={Position.Bottom} className="!bg-transparent !border-none !w-0 !h-0" id="bottom" />
      <Handle type="target" position={Position.Left} className="!bg-transparent !border-none !w-0 !h-0" id="left" />
      <Handle type="target" position={Position.Right} className="!bg-transparent !border-none !w-0 !h-0" id="right" />
    </div>
  );
});
