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
        "relative w-44 rounded-lg border bg-gray-900 p-3 transition-all duration-300",
        !isOnline && "opacity-40 border-gray-800",
        isOnline && intensity === "idle" && "border-gray-700 animate-breathe",
        isOnline && intensity === "working" && "border-lattice-500 animate-glow-working",
        isOnline && intensity === "success" && "border-emerald-400 animate-glow-success",
        isOnline && intensity === "error" && "border-red-400 animate-glow-error"
      )}
    >
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-lattice-400 shrink-0" />
        <span className="text-xs font-semibold text-gray-100 truncate">
          {data.agentName}
        </span>
        <div
          className={clsx(
            "ml-auto h-2 w-2 rounded-full shrink-0",
            isOnline ? "bg-emerald-400" : "bg-gray-600"
          )}
        />
      </div>

      <p className="mt-1 text-[10px] text-gray-500 line-clamp-1">
        {data.description}
      </p>

      {data.skills.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {data.skills.slice(0, 3).map((skill) => (
            <span
              key={skill}
              className="rounded bg-gray-800 px-1.5 py-0.5 text-[9px] text-gray-400"
            >
              {skill}
            </span>
          ))}
          {data.skills.length > 3 && (
            <span className="text-[9px] text-gray-600">
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
