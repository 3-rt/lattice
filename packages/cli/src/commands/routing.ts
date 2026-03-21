import type { Command } from "commander";
import { RelayClient } from "../lib/client.js";
import { getRelayUrl } from "../lib/config.js";
import { formatTable } from "../lib/format.js";

export function registerRouting(program: Command) {
  const routing = program
    .command("routing")
    .description("Routing management commands");

  routing
    .command("stats")
    .description("Show routing performance statistics")
    .action(async () => {
      const client = new RelayClient(getRelayUrl());
      try {
        const stats = await client.getRoutingStats();
        if (stats.length === 0) {
          console.log("No routing stats yet. Send some tasks first.");
          return;
        }
        const rows = stats.map((s) => {
          const total = s.successes + s.failures;
          const rate = total > 0 ? ((s.successes / total) * 100).toFixed(0) : "\u2014";
          const avgLatency = total > 0 ? (s.total_latency_ms / total).toFixed(0) : "\u2014";
          return [s.agent_name, s.category, String(s.successes), String(s.failures), `${rate}%`, `${avgLatency}ms`];
        });
        console.log(formatTable(["Agent", "Category", "Pass", "Fail", "Rate", "Avg Latency"], rows));
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
}
