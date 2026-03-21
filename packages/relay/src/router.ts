import type { LatticeRegistry } from "./registry.js";

export interface RouteResult {
  agentName: string;
  reason: string;
}

export interface LatticeRouter {
  route(taskText: string, explicitAgent?: string): RouteResult;
}

export function createRouter(registry: LatticeRegistry): LatticeRouter {
  let roundRobinIndex = 0;
  return {
    route(taskText, explicitAgent) {
      const onlineAgents = registry.getOnlineAgents();
      if (onlineAgents.length === 0) throw new Error("No agents available");

      if (explicitAgent) {
        const agent = onlineAgents.find((a) => a.name === explicitAgent);
        if (!agent) throw new Error(`Agent "${explicitAgent}" not found or offline`);
        return { agentName: explicitAgent, reason: "explicit agent override" };
      }

      const words = taskText.toLowerCase().split(/\s+/);
      let bestAgent = "";
      let bestScore = 0;

      for (const agent of onlineAgents) {
        let score = 0;
        for (const skill of agent.card.skills) {
          for (const tag of skill.tags) {
            const tagLower = tag.toLowerCase();
            for (const word of words) {
              if (word.includes(tagLower) || tagLower.includes(word)) score++;
            }
          }
        }
        if (score > bestScore) { bestScore = score; bestAgent = agent.name; }
      }

      if (bestScore > 0) return { agentName: bestAgent, reason: `skill match (score: ${bestScore})` };

      const index = roundRobinIndex % onlineAgents.length;
      roundRobinIndex++;
      return { agentName: onlineAgents[index].name, reason: "round-robin fallback (no skill match)" };
    },
  };
}
