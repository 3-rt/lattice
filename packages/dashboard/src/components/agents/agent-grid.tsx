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
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-800 py-12">
        <p className="text-sm text-gray-500">No agents registered</p>
        <p className="mt-1 text-xs text-gray-600">
          Start the relay with adapters enabled to see agents here
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <AnimatePresence>
        {agents.map((agent) => (
          <AgentCard key={agent.name} agent={agent} />
        ))}
      </AnimatePresence>
    </div>
  );
}
