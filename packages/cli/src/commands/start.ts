import type { Command } from "commander";
import fs from "fs";
import path from "path";

export function registerStart(program: Command) {
  program
    .command("start")
    .description("Start the Lattice relay server with enabled adapters")
    .option("--adapters <list>", "Comma-separated list of adapters to enable")
    .action(async (opts) => {
      console.log("Starting Lattice relay...\n");

      try {
        const { createDatabase, createEventBus, createRegistry, createRouter, createTaskManager, createApp } = await import("@lattice/relay");

        const configPath = path.resolve(process.cwd(), "lattice.config.json");
        const config = fs.existsSync(configPath)
          ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
          : { relay: { port: 3100, host: "localhost" } };

        const port = config.relay?.port ?? 3100;
        const host = config.relay?.host ?? "localhost";

        const db = createDatabase(path.resolve(process.cwd(), "lattice.db"));
        const bus = createEventBus();
        const registry = createRegistry(db, bus);
        const router = createRouter(registry);
        const taskManager = createTaskManager(db, bus, registry, router);
        const app = createApp({ db, registry, taskManager, bus });

        const adapters = config.adapters ?? {};
        const enabledList = opts.adapters?.split(",").map((s: string) => s.trim());

        if (!enabledList || adapters["claude-code"]?.enabled || enabledList?.includes("claude-code")) {
          try {
            const { createClaudeCodeAdapter } = await import("@lattice/adapter-claude-code");
            registry.register(createClaudeCodeAdapter());
            console.log("  \u2713 claude-code adapter loaded");
          } catch { /* not installed */ }
        }

        if (!enabledList || adapters["openclaw"]?.enabled || enabledList?.includes("openclaw")) {
          try {
            const { createOpenClawAdapter } = await import("@lattice/adapter-openclaw");
            const gatewayUrl = adapters["openclaw"]?.gatewayUrl ?? "http://localhost:18789";
            const gatewayToken = (adapters["openclaw"]?.gatewayToken as string)?.replace("${OPENCLAW_GATEWAY_TOKEN}", process.env.OPENCLAW_GATEWAY_TOKEN ?? "") ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
            const deviceToken = (adapters["openclaw"]?.deviceToken as string)?.replace("${OPENCLAW_DEVICE_TOKEN}", process.env.OPENCLAW_DEVICE_TOKEN ?? "") ?? process.env.OPENCLAW_DEVICE_TOKEN ?? "";
            const { readFileSync } = await import("node:fs");
            const { resolve } = await import("node:path");
            const identityPath = resolve(process.cwd(), (adapters["openclaw"]?.deviceIdentityPath as string) ?? ".openclaw-device.json");
            const deviceIdentity = JSON.parse(readFileSync(identityPath, "utf8"));
            registry.register(createOpenClawAdapter({ gatewayUrl, gatewayToken, deviceToken, deviceIdentity }));
            console.log("  \u2713 openclaw adapter loaded");
          } catch { /* not installed */ }
        }

        if (!enabledList || adapters["codex"]?.enabled || enabledList?.includes("codex")) {
          try {
            const { createCodexAdapter } = await import("@lattice/adapter-codex");
            const codexPath = adapters["codex"]?.codexPath ?? "codex";
            registry.register(createCodexAdapter({ codexPath }));
            console.log("  \u2713 codex adapter loaded");
          } catch { /* not installed */ }
        }

        app.listen(port, host, () => {
          console.log(`\nLattice relay server running at http://${host}:${port}`);
          console.log(`SSE endpoint: http://${host}:${port}/api/events`);
          console.log(`Agents registered: ${registry.listAgents().length}`);
        });

        setInterval(() => registry.runHealthChecks(), 30_000);
      } catch (err) {
        console.error("Failed to start relay:", err instanceof Error ? err.message : err);
        process.exit(1);
      }
    });
}
