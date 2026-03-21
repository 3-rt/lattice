import { motion } from "framer-motion";
import { clsx } from "clsx";
import type { AgentInfo } from "../../lib/api.ts";

interface AgentCardProps {
  agent: AgentInfo;
}

export function AgentCard({ agent }: AgentCardProps) {
  const isOnline = agent.status === "online";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={clsx(
        "rounded-lg border bg-gray-900 p-4 transition-shadow",
        isOnline ? "border-gray-700 hover:border-lattice-700 hover:shadow-lg hover:shadow-lattice-900/20" : "border-gray-800 opacity-60"
      )}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-100">{agent.card.name}</h3>
        <div className="flex items-center gap-1.5">
          <div
            className={clsx(
              "h-2 w-2 rounded-full",
              isOnline ? "bg-emerald-400 shadow-sm shadow-emerald-400/50" : "bg-gray-600"
            )}
          />
          <span className="text-xs text-gray-500">{agent.status}</span>
        </div>
      </div>

      <p className="mt-1 text-xs text-gray-400 line-clamp-2">{agent.card.description}</p>

      <div className="mt-3 flex flex-wrap gap-1">
        {agent.card.skills.map((skill) => (
          <span
            key={skill.id}
            className="rounded bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400"
          >
            {skill.name}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-3 text-[10px] text-gray-600">
        <span>v{agent.card.version}</span>
        {agent.card.capabilities.streaming && <span>Streaming</span>}
      </div>
    </motion.div>
  );
}
