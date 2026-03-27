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
    <div className="space-y-3">
      <h3 className="section-label px-1">
        Node Palette
      </h3>
      {nodeBlocks.map((block) => (
        <div
          key={block.type}
          draggable
          onDragStart={(event) => onDragStart(event, block.type)}
          className={`workflow-palette-card cursor-grab rounded-2xl border ${block.borderColor} bg-white/[0.03] p-3 transition-all hover:bg-white/[0.06] active:cursor-grabbing`}
        >
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/8 bg-black/10">
              <block.icon className={`h-4 w-4 shrink-0 ${block.color}`} />
            </span>
            <div>
              <p className="text-xs font-medium text-[var(--text-strong)]">{block.label}</p>
              <p className="text-[10px] text-[var(--text-muted)]">{block.description}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
