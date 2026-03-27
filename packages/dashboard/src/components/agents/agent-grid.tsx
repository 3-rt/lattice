import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useLatticeStore } from "../../store/lattice-store.ts";
import { fetchAgents } from "../../lib/api.ts";
import { AgentCard } from "./agent-card.tsx";

export function AgentGrid() {
  const agents = useLatticeStore((s) => s.agents);
  const setAgents = useLatticeStore((s) => s.setAgents);

  useEffect(() => {
    fetchAgents().then(setAgents).catch(console.error);
  }, [setAgents]);

  if (agents.length === 0) {
    return (
      <div className="surface-panel flex flex-col items-center justify-center px-6 py-14 text-center">
        <p className="section-label">Agent registry</p>
        <p className="mt-3 text-base font-medium text-[var(--text-strong)]">
          No agents are registered yet.
        </p>
        <p className="mt-2 max-w-md text-sm text-[var(--text-muted)]">
          Start the relay with adapters enabled to see agents here
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="section-label">Registered agents</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Each card shows current readiness, major capabilities, and where to
            look first when something is offline.
          </p>
        </div>
        <div className="status-pill">
          <span className="status-dot bg-[var(--accent-primary)]" />
          <span>{agents.length} available entries</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AnimatePresence>
          {agents.map((agent) => (
            <AgentCard key={agent.name} agent={agent} />
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
