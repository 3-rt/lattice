import type { Command } from "commander";
import { RelayClient } from "../lib/client.js";
import { getRelayUrl } from "../lib/config.js";
import { formatTable, statusIcon } from "../lib/format.js";

export function registerAgents(program: Command) {
  program
    .command("agents")
    .description("List registered agents and their status")
    .action(async () => {
      const client = new RelayClient(getRelayUrl());
      try {
        const agents = await client.listAgents();
        if (agents.length === 0) {
          console.log("No agents registered.");
          return;
        }
        const rows = agents.map((a) => [
          statusIcon(a.status),
          a.name,
          a.status,
          ((a.card as Record<string, unknown>)?.skills as Array<{ name: string }>)?.map((s) => s.name).join(", ") ?? "",
        ]);
        console.log(formatTable(["", "Name", "Status", "Skills"], rows));
      } catch (err) {
        console.error("Error:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
}
