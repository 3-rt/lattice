import fs from "fs";
import path from "path";

export interface LatticeConfig {
  relay: { port: number; host: string };
  adapters?: Record<string, unknown>;
  dashboard?: { port: number };
}

export function loadConfig(): LatticeConfig {
  const configPath = path.resolve(process.cwd(), "lattice.config.json");
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }
  return { relay: { port: 3100, host: "localhost" } };
}

export function getRelayUrl(config?: LatticeConfig): string {
  const c = config ?? loadConfig();
  const host = c.relay?.host ?? "localhost";
  const port = c.relay?.port ?? 3100;
  return `http://${host}:${port}`;
}
