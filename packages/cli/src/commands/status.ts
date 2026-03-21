import type { Command } from "commander";
import { RelayClient } from "../lib/client.js";
import { getRelayUrl } from "../lib/config.js";
import { statusIcon } from "../lib/format.js";

export function registerStatus(program: Command) {
  program
    .command("status")
    .description("Show relay health and agent statuses")
    .action(async () => {
      const client = new RelayClient(getRelayUrl());
      try {
        const agents = await client.listAgents();
        const online = agents.filter((a) => a.status === "online").length;
        console.log(`${statusIcon("online")} Relay: connected`);
        console.log(`  Agents: ${online}/${agents.length} online\n`);
        for (const a of agents) {
          console.log(`  ${statusIcon(a.status)} ${a.name} \u2014 ${a.status}`);
        }
      } catch {
        console.log(`${statusIcon("offline")} Relay: not running`);
        console.log("  Start with: lattice start");
        process.exit(1);
      }
    });
}
