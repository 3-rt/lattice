import fs from "fs";
import path from "path";
import { createDatabase } from "./db.js";
import { createEventBus } from "./event-bus.js";
import { createRegistry } from "./registry.js";
import { createRouter } from "./router.js";
import { createTaskManager } from "./task-manager.js";
import { createApp } from "./server.js";

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

app.listen(port, host, () => {
  console.log(`Lattice relay server running at http://${host}:${port}`);
  console.log(`SSE endpoint: http://${host}:${port}/api/events`);
  console.log(`Agents registered: ${registry.listAgents().length}`);
});

setInterval(() => registry.runHealthChecks(), 30_000);
