import type { LatticeRegistry } from "./registry.js";
import type { LatticeDB, RoutingStatsRow } from "./db.js";
import type { LatticeRouter, RouteResult } from "./router.js";
import { categorize } from "./categorizer.js";
import { betaSample, createSeededRandom } from "./beta-sample.js";

export interface LearnedRouterOptions {
  /** Fixed seed for deterministic tests. If undefined, uses Math.random. */
  seed?: number;
}

/**
 * Creates a Thompson Sampling router that learns which agent is best per task category.
 *
 * Algorithm:
 * 1. Categorize the task text
 * 2. For each online agent, look up (agent, category) stats
 * 3. Sample from Beta(successes + 1, failures + 1) for each agent
 * 4. Pick the agent with the highest sample
 *
 * Falls back to explicit-agent override (highest priority) like the simple router.
 */
export function createLearnedRouter(
  registry: LatticeRegistry,
  db: LatticeDB,
  options: LearnedRouterOptions = {}
): LatticeRouter {
  return {
    route(taskText: string, explicitAgent?: string): RouteResult {
      const onlineAgents = registry.getOnlineAgents();
      if (onlineAgents.length === 0) throw new Error("No agents available");

      // Priority 1: explicit agent override
      if (explicitAgent) {
        const agent = onlineAgents.find((a) => a.name === explicitAgent);
        if (!agent) throw new Error(`Agent "${explicitAgent}" not found or offline`);
        return { agentName: explicitAgent, reason: "explicit agent override" };
      }

      // Categorize the task
      const category = categorize(taskText);

      // Build a lookup of stats by (agent_name, category)
      const allStats = db.getRoutingStats();
      const statsMap = new Map<string, RoutingStatsRow>();
      for (const row of allStats) {
        statsMap.set(`${row.agent_name}::${row.category}`, row);
      }

      // Create RNG: use seed if provided, otherwise use a fresh random seed
      const seed = options.seed ?? Math.floor(Math.random() * 2147483647);
      const rng = createSeededRandom(seed);

      // Thompson Sampling: sample from Beta(alpha, beta) for each agent
      let bestAgent = "";
      let bestSample = -1;

      for (const agent of onlineAgents) {
        const key = `${agent.name}::${category}`;
        const stats = statsMap.get(key);
        const alpha = (stats?.successes ?? 0) + 1; // Prior: Beta(1, 1) = Uniform
        const beta = (stats?.failures ?? 0) + 1;
        const sample = betaSample(alpha, beta, rng);

        if (sample > bestSample) {
          bestSample = sample;
          bestAgent = agent.name;
        }
      }

      return {
        agentName: bestAgent,
        reason: `thompson sampling (category: ${category}, sample: ${bestSample.toFixed(3)})`,
      };
    },
  };
}
