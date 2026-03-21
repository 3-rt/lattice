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
    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border-2 border-lattice-500 bg-gray-900 shadow-lg shadow-lattice-900/40">
      <div className="absolute inset-0 rounded-full animate-breathe" />
      <div className="flex flex-col items-center gap-0.5 z-10">
        <Zap className="h-5 w-5 text-lattice-400" />
        <span className="text-[9px] font-bold uppercase tracking-widest text-lattice-300">
          {data.label}
        </span>
      </div>
      {data.taskCount > 0 && (
        <div className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-lattice-600 text-[9px] font-bold text-white shadow">
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
