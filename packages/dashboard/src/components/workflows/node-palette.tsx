import type { DragEvent } from "react";
import { Bot, GitBranch } from "lucide-react";

const nodeBlocks = [
  {
    type: "agent-task" as const,
    label: "Agent Task",
    description: "Send a task to an agent",
    icon: Bot,
    color: "text-lattice-400",
    borderColor: "border-lattice-600/30",
  },
  {
    type: "condition" as const,
    label: "Condition",
    description: "Branch based on a field value",
    icon: GitBranch,
    color: "text-amber-400",
    borderColor: "border-amber-600/30",
  },
];

function onDragStart(event: DragEvent<HTMLDivElement>, nodeType: string) {
  event.dataTransfer.setData("application/lattice-node-type", nodeType);
  event.dataTransfer.effectAllowed = "move";
}

export function NodePalette() {
  return (
    <div className="space-y-2">
      <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        Node Palette
      </h3>
      {nodeBlocks.map((block) => (
        <div
          key={block.type}
          draggable
          onDragStart={(event) => onDragStart(event, block.type)}
          className={`cursor-grab rounded-md border ${block.borderColor} bg-gray-900/80 p-2.5 transition-colors hover:bg-gray-800/80 active:cursor-grabbing`}
        >
          <div className="flex items-center gap-3">
            <block.icon className={`h-4 w-4 shrink-0 ${block.color}`} />
            <div>
              <p className="text-xs font-medium text-gray-200">{block.label}</p>
              <p className="text-[10px] text-gray-500">{block.description}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
