import { motion } from "framer-motion";
import { clsx } from "clsx";
import type { AgentInfo } from "../../lib/api.ts";

interface AgentCardProps {
  agent: AgentInfo;
}

export function AgentCard({ agent }: AgentCardProps) {
  const isOnline = agent.status === "online";
  const statusLabel = isOnline ? "Ready" : "Needs attention";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className={clsx(
        "surface-panel relative overflow-hidden p-5 transition duration-300",
        isOnline
          ? "hover:-translate-y-0.5 hover:border-[color:var(--border-strong)]"
          : "border-[color:color-mix(in_oklch,var(--warning),transparent_72%)]"
      )}
    >
      <div className="absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-label">{agent.name}</p>
          <h3 className="mt-2 text-lg font-semibold tracking-[-0.03em] text-[var(--text-strong)]">
            {agent.card.name}
          </h3>
        </div>
        <div className="status-pill">
          <div
            className={clsx(
              "status-dot shadow-[0_0_12px_rgba(96,165,250,0.25)]",
              isOnline ? "bg-emerald-400" : "bg-amber-400"
            )}
          />
          <span>{statusLabel}</span>
        </div>
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-6 text-[var(--text-muted)]">
        {agent.card.description}
      </p>

      {!isOnline && agent.statusReason && (
        <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-300/8 px-4 py-3">
          <p className="section-label text-amber-200/70">Needs attention</p>
          <p className="mt-2 text-sm leading-6 text-amber-100/80">{agent.statusReason}</p>
        </div>
      )}

      <div className="mt-5">
        <p className="section-label">Core skills</p>
        <div className="mt-2 flex flex-wrap gap-2">
        {agent.card.skills.map((skill) => (
          <span
            key={skill.id}
            className="rounded-full border border-white/8 bg-white/5 px-2.5 py-1 text-[0.7rem] text-[var(--text-muted)]"
          >
            {skill.name}
          </span>
        ))}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-white/6 pt-4 text-[0.72rem] text-[var(--text-soft)]">
        <span>v{agent.card.version}</span>
        {agent.card.capabilities.streaming && <span>Streaming</span>}
        <span>{agent.card.authentication.schemes.join(", ")}</span>
      </div>
    </motion.div>
  );
}
