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

const DEMO_MODE = process.argv.includes("--demo");

const configPath = path.resolve(process.cwd(), "lattice.config.json");
const config = fs.existsSync(configPath)
  ? JSON.parse(fs.readFileSync(configPath, "utf-8"))
  : { relay: { port: 3100, host: "localhost" } };

const port = config.relay?.port ?? 3100;
const host = config.relay?.host ?? "localhost";

const dataDir = path.resolve(process.cwd(), "data");
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = DEMO_MODE
  ? path.resolve(dataDir, "lattice-demo.db")
  : path.resolve(dataDir, "lattice.db");

// Clean slate for demo mode
if (DEMO_MODE) {
  for (const suffix of ["", "-shm", "-wal"]) {
    const f = dbPath + suffix;
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

const db = createDatabase(dbPath);
const bus = createEventBus();
const registry = createRegistry(db, bus);
const routingConfig = config.routing ?? {};
const router = createRouterFromConfig(registry, db, {
  strategy: routingConfig.strategy ?? "simple",
});
const taskManager = createTaskManager(db, bus, registry, router);
const workflowEngine = createWorkflowEngine(db, taskManager, bus);
const app = createApp({ db, registry, taskManager, bus, workflowEngine });

// Load demo adapters (mock agents, no external dependencies)
async function loadDemoAdapters() {
  const { createDemoClaudeCodeAdapter, createDemoOpenClawAdapter, createDemoCodexAdapter } =
    await import("./demo-adapters.js");

  console.log("\n  Lattice  (demo mode)\n");
  console.log("  Adapters:");

  const claude = createDemoClaudeCodeAdapter();
  registry.register(claude);
  console.log("  \u2713 claude-code     ready (simulated)");

  const openclaw = createDemoOpenClawAdapter();
  registry.register(openclaw);
  console.log("  \u2713 openclaw        ready (simulated)");

  const codex = createDemoCodexAdapter();
  registry.register(codex);
  console.log("  \u2713 codex           ready (simulated)");

  console.log();
}

// Load real adapters from config
async function loadAdapters() {
  const adapters = config.adapters ?? {};

  console.log("\n  Lattice\n");
  console.log("  Adapters:");

  if (adapters["claude-code"]?.enabled) {
    try {
      const { createClaudeCodeAdapter } = await import("@lattice/adapter-claude-code").catch(
        () => import("../../adapters/claude-code/src/index.ts")
      );
      const adapter = createClaudeCodeAdapter();
      registry.register(adapter);
      const result = await adapter.healthCheck();
      const { ok, reason } = typeof result === "boolean" ? { ok: result, reason: undefined } : result;
      if (!ok) {
        const entry = registry.listAgents().find((a) => a.name === "claude-code");
        if (entry) { entry.status = "offline"; entry.statusReason = reason; }
        console.log(`  \u26A0 claude-code     ${reason ?? "offline"}`);
      } else {
        console.log("  \u2713 claude-code     ready");
      }
    } catch (err) {
      console.log(`  \u2717 claude-code     ${err instanceof Error ? err.message : err}`);
    }
  }

  if (adapters["openclaw"]?.enabled) {
    const resolveEnv = (val: string | undefined, envKey: string) =>
      val?.replace(`\${${envKey}}`, process.env[envKey] ?? "") ?? process.env[envKey] ?? "";

    const gatewayToken = resolveEnv(adapters["openclaw"].gatewayToken, "OPENCLAW_GATEWAY_TOKEN").replace(/\s+/g, "");
    const deviceToken = resolveEnv(adapters["openclaw"].deviceToken, "OPENCLAW_DEVICE_TOKEN").replace(/\s+/g, "");

    if (!gatewayToken || !deviceToken) {
      const missing = [
        !gatewayToken && "OPENCLAW_GATEWAY_TOKEN",
        !deviceToken && "OPENCLAW_DEVICE_TOKEN",
      ].filter(Boolean).join(" and ");
      console.log(`  \u26A0 openclaw        ${missing} not set`);
      try {
        const { createOpenClawAdapter } = await import("@lattice/adapter-openclaw").catch(
          () => import("../../adapters/openclaw/src/index.ts")
        );
        const gatewayUrl = adapters["openclaw"].gatewayUrl ?? "http://localhost:18789";
        const adapter = createOpenClawAdapter({
          gatewayUrl,
          gatewayToken: "",
          deviceToken: "",
          deviceIdentity: {
            deviceId: "",
            publicKeyPem: "",
            privateKeyPem: "",
            platform: "",
          },
        });
        registry.register(adapter);
        const entry = registry.listAgents().find((a) => a.name === "openclaw");
        if (entry) {
          entry.status = "offline";
          entry.statusReason = `${missing} not configured.`;
        }
      } catch { /* ignore */ }
    } else {
      try {
        const { createOpenClawAdapter } = await import("@lattice/adapter-openclaw").catch(
          () => import("../../adapters/openclaw/src/index.ts")
        );
        const { readFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const gatewayUrl = adapters["openclaw"].gatewayUrl ?? "http://localhost:18789";
        const identityPath = resolve(process.cwd(), adapters["openclaw"].deviceIdentityPath ?? ".openclaw-device.json");
        const deviceIdentity = JSON.parse(readFileSync(identityPath, "utf8"));
        const promptPrefix = adapters["openclaw"].promptPrefix;
        const adapter = createOpenClawAdapter({ gatewayUrl, gatewayToken, deviceToken, deviceIdentity, ...(promptPrefix !== undefined && { promptPrefix }) });
        registry.register(adapter);
        const result = await adapter.healthCheck();
        const { ok, reason } = typeof result === "boolean" ? { ok: result, reason: undefined } : result;
        if (!ok) {
          const entry = registry.listAgents().find((a) => a.name === "openclaw");
          if (entry) { entry.status = "offline"; entry.statusReason = reason; }
          console.log(`  \u26A0 openclaw        ${reason ?? "offline"}`);
        } else {
          console.log("  \u2713 openclaw        ready");
        }
      } catch (err) {
        console.log(`  \u2717 openclaw        ${err instanceof Error ? err.message : err}`);
      }
    }
  }

  if (adapters["codex"]?.enabled) {
    try {
      const { createCodexAdapter } = await import("@lattice/adapter-codex").catch(
        () => import("../../adapters/codex/src/index.ts")
      );
      const codexPath = adapters["codex"].codexPath ?? "codex";
      const adapter = createCodexAdapter({ codexPath });
      registry.register(adapter);
      const result = await adapter.healthCheck();
      const { ok, reason } = typeof result === "boolean" ? { ok: result, reason: undefined } : result;
      if (!ok) {
        const entry = registry.listAgents().find((a) => a.name === "codex");
        if (entry) { entry.status = "offline"; entry.statusReason = reason; }
        console.log(`  \u26A0 codex           ${reason ?? "offline"}`);
      } else {
        console.log("  \u2713 codex           ready");
      }
    } catch (err) {
      console.log(`  \u2717 codex           ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log();
}

(DEMO_MODE ? loadDemoAdapters() : loadAdapters()).then(() => {
  const workflowDir = path.resolve(
    process.cwd(),
    config.workflows?.seedDir ?? "workflows"
  );
  const seedResult = seedWorkflows(db, workflowDir);
  if (seedResult.loaded > 0 || seedResult.skipped > 0) {
    console.log("  Workflows:");
    if (seedResult.loaded > 0) console.log(`    \u2713 ${seedResult.loaded} workflow(s) loaded`);
    if (seedResult.skipped > 0) console.log(`    \u2713 ${seedResult.skipped} existing workflow(s)`);
    for (const error of seedResult.errors) {
      console.log(`    \u2717 ${error}`);
    }
    console.log();
  }

  const onlineCount = registry.getOnlineAgents().length;
  const totalCount = registry.listAgents().length;

  app.listen(port, host, () => {
    console.log(`  Relay running at http://${host}:${port}`);
    console.log(`  Agents online: ${onlineCount} of ${totalCount}`);
    console.log();
  });

  setInterval(() => registry.runHealthChecks(), 30_000);
}).catch((err) => {
  console.error("Fatal: failed to load adapters:", err);
  process.exit(1);
});
