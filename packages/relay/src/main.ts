import fs from "fs";
import path from "path";
import { createDatabase } from "./db.js";
import { createEventBus } from "./event-bus.js";
import { createRegistry } from "./registry.js";
import { createRouterFromConfig } from "./router.js";
import { createTaskManager } from "./task-manager.js";
import { createApp } from "./server.js";
import { createWorkflowEngine } from "./workflow-engine.js";
import { seedWorkflows } from "./seed-workflows.js";

const configPath = path.resolve(process.cwd(), "lattice.config.json");
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
  : { relay: { port: 3100, host: "localhost" } };

const port = config.relay?.port ?? 3100;
const host = config.relay?.host ?? "localhost";

const db = createDatabase(path.resolve(process.cwd(), "lattice.db"));
const bus = createEventBus();
const registry = createRegistry(db, bus);
const routingConfig = config.routing ?? {};
const router = createRouterFromConfig(registry, db, {
  strategy: routingConfig.strategy ?? "simple",
});
const taskManager = createTaskManager(db, bus, registry, router);
const workflowEngine = createWorkflowEngine(db, taskManager, bus);
const app = createApp({ db, registry, taskManager, bus, workflowEngine });

// Load enabled adapters from config
async function loadAdapters() {
  const adapters = config.adapters ?? {};

  if (adapters["claude-code"]?.enabled) {
    try {
      const { createClaudeCodeAdapter } = await import("@lattice/adapter-claude-code").catch(
        () => import("../../adapters/claude-code/src/index.ts")
      );
      registry.register(createClaudeCodeAdapter());
      console.log("  ✓ claude-code adapter loaded");
    } catch (err) {
      console.error("  ✗ claude-code adapter failed to load:", err instanceof Error ? err.message : err);
    }
  }

  if (adapters["openclaw"]?.enabled) {
    try {
      const { createOpenClawAdapter } = await import("@lattice/adapter-openclaw").catch(
        () => import("../../adapters/openclaw/src/index.ts")
      );
      const gatewayUrl = adapters["openclaw"].gatewayUrl ?? "http://localhost:18789";
      const gatewayToken =
        adapters["openclaw"].gatewayToken?.replace(
          "${OPENCLAW_GATEWAY_TOKEN}",
          process.env.OPENCLAW_GATEWAY_TOKEN ?? ""
        ) ?? process.env.OPENCLAW_GATEWAY_TOKEN ?? "";
      registry.register(createOpenClawAdapter({ gatewayUrl, gatewayToken }));
      console.log("  ✓ openclaw adapter loaded");
    } catch (err) {
      console.error("  ✗ openclaw adapter failed to load:", err instanceof Error ? err.message : err);
    }
  }

  if (adapters["codex"]?.enabled) {
    try {
      const { createCodexAdapter } = await import("@lattice/adapter-codex").catch(
        () => import("../../adapters/codex/src/index.ts")
      );
      const codexPath = adapters["codex"].codexPath ?? "codex";
      registry.register(createCodexAdapter({ codexPath }));
      console.log("  ✓ codex adapter loaded");
    } catch (err) {
      console.error("  ✗ codex adapter failed to load:", err instanceof Error ? err.message : err);
    }
  }
}

loadAdapters().then(() => {
  const workflowDir = path.resolve(
    process.cwd(),
    config.workflows?.seedDir ?? "workflows"
  );
  const seedResult = seedWorkflows(db, workflowDir);
  if (seedResult.loaded > 0) {
    console.log(`  Seeded ${seedResult.loaded} workflow(s) from ${workflowDir}`);
  }
  if (seedResult.skipped > 0) {
    console.log(`  Skipped ${seedResult.skipped} existing workflow(s)`);
  }
  for (const error of seedResult.errors) {
    console.error(`  ✗ workflow seed error: ${error}`);
  }

  app.listen(port, host, () => {
    console.log(`Lattice relay server running at http://${host}:${port}`);
    console.log(`SSE endpoint: http://${host}:${port}/api/events`);
    console.log(`Agents registered: ${registry.listAgents().length}`);
  });

  setInterval(() => registry.runHealthChecks(), 30_000);
}).catch((err) => {
  console.error("Fatal: failed to load adapters:", err);
  process.exit(1);
});
