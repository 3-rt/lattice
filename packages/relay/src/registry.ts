import type { LatticeAdapter, AgentCard } from "@lattice/adapter-base";
import type { LatticeDB } from "./db.js";
import type { LatticeEventBus } from "./event-bus.js";

export interface AgentEntry {
  name: string;
  card: AgentCard;
  adapter: LatticeAdapter;
  status: "online" | "offline";
}

export interface LatticeRegistry {
  register(adapter: LatticeAdapter): void;
  deregister(name: string): void;
  getAdapter(name: string): LatticeAdapter | undefined;
  getAgentCard(name: string): AgentCard | undefined;
  listAgents(): AgentEntry[];
  getOnlineAgents(): AgentEntry[];
  runHealthChecks(): Promise<void>;
}

export function createRegistry(db: LatticeDB, eventBus: LatticeEventBus): LatticeRegistry {
  const agents = new Map<string, AgentEntry>();

  return {
    register(adapter) {
      const card = adapter.getAgentCard();
      const entry: AgentEntry = { name: card.name, card, adapter, status: "online" };
      agents.set(card.name, entry);
      db.upsertAgent(card.name, card);
      eventBus.emit({ type: "agent:registered", agent: card });
    },
    deregister(name) {
      agents.delete(name);
      db.deleteAgent(name);
      eventBus.emit({ type: "agent:deregistered", agentName: name });
    },
    getAdapter(name) { return agents.get(name)?.adapter; },
    getAgentCard(name) { return agents.get(name)?.card; },
    listAgents() { return [...agents.values()]; },
    getOnlineAgents() { return [...agents.values()].filter((a) => a.status === "online"); },
    async runHealthChecks() {
      for (const [name, entry] of agents) {
        try {
          const healthy = await entry.adapter.healthCheck();
          const newStatus = healthy ? "online" : "offline";
          if (newStatus !== entry.status) {
            entry.status = newStatus;
            db.updateAgentStatus(name, newStatus);
            eventBus.emit({ type: "agent:status", agentName: name, status: newStatus });
          }
        } catch {
          if (entry.status !== "offline") {
            entry.status = "offline";
            db.updateAgentStatus(name, "offline");
            eventBus.emit({ type: "agent:status", agentName: name, status: "offline" });
          }
        }
      }
    },
  };
}
