/**
 * Probe the OpenClaw gateway `send` RPC method to discover its payload schema.
 * Usage: npx tsx scripts/openclaw-probe-send.ts
 *
 * Connects, then fires `send` with minimal/guessed params.
 * The gateway's error response will reveal required fields.
 */

import { randomUUID } from "node:crypto";
import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import WebSocket from "ws";

// --- Load config ---
const config = JSON.parse(readFileSync(resolve(process.cwd(), "lattice.config.json"), "utf8"));
const ocConfig = config.adapters?.openclaw;
if (!ocConfig) { console.error("No openclaw config in lattice.config.json"); process.exit(1); }

const gatewayToken = (ocConfig.gatewayToken ?? "").replace(/\$\{(\w+)\}/g, (_: string, k: string) => process.env[k] ?? "").replace(/\s+/g, "");
const deviceToken = (ocConfig.deviceToken ?? "").replace(/\$\{(\w+)\}/g, (_: string, k: string) => process.env[k] ?? "").replace(/\s+/g, "");
if (!gatewayToken || !deviceToken) { console.error("OPENCLAW_GATEWAY_TOKEN and OPENCLAW_DEVICE_TOKEN must be set"); process.exit(1); }

const identityPath = resolve(process.cwd(), ocConfig.deviceIdentityPath ?? ".openclaw-device.json");
const identity = JSON.parse(readFileSync(identityPath, "utf8"));
const wsUrl = (ocConfig.gatewayUrl ?? "http://localhost:18789").replace(/^http:/, "ws:").replace(/^https:/, "wss:").replace(/\/$/, "");

// --- Crypto helpers (same as capture script) ---
function base64UrlEncode(buf: Buffer): string { return buf.toString("base64url"); }

function buildPayloadV3(p: { deviceId: string; nonce: string; signedAtMs: number; token: string }): string {
  return ["v3", p.deviceId, "gateway-client", "backend", "operator",
    "operator.admin,operator.read,operator.write,operator.approvals",
    String(p.signedAtMs), p.token, p.nonce, identity.platform ?? "", ""].join("|");
}

function sign(payload: string): string {
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, "utf8"), crypto.createPrivateKey(identity.privateKeyPem)));
}

function publicKeyRaw(): string {
  const spki = crypto.createPublicKey(identity.publicKeyPem).export({ type: "spki", format: "der" });
  return base64UrlEncode(spki.subarray(-32));
}

// --- Connect ---
console.log(`Connecting to ${wsUrl}...`);
const ws = new WebSocket(wsUrl);

const pending = new Map<string, (ok: boolean, payload: unknown) => void>();

ws.on("error", (err) => { console.error("WS error:", err.message); process.exit(1); });
ws.on("close", () => { console.log("WS closed"); process.exit(0); });

ws.on("message", (data) => {
  const raw = data.toString();
  let msg: Record<string, unknown>;
  try { msg = JSON.parse(raw); } catch { console.log("[raw]", raw); return; }

  if (msg.type === "event") {
    const event = msg.event as string;

    if (event === "connect.challenge") {
      const nonce = (msg.payload as Record<string, unknown>)?.nonce as string;
      const signedAtMs = Date.now();
      const payload = buildPayloadV3({ deviceId: identity.deviceId, nonce, signedAtMs, token: gatewayToken });
      const id = randomUUID();
      pending.set(id, (ok) => {
        if (!ok) { console.error("Connect rejected"); process.exit(1); }
        console.log("Connected! Probing `send` method...\n");
        runProbes();
      });
      ws.send(JSON.stringify({
        type: "req", id, method: "connect",
        params: {
          minProtocol: 3, maxProtocol: 3,
          client: { id: "gateway-client", version: "1.0.0", platform: identity.platform, mode: "backend", instanceId: randomUUID() },
          role: "operator", scopes: ["operator.admin", "operator.read", "operator.write", "operator.approvals"], caps: [],
          auth: { token: gatewayToken, deviceToken },
          device: { id: identity.deviceId, publicKey: publicKeyRaw(), signature: sign(payload), signedAt: signedAtMs, nonce },
        },
      }));
      return;
    }

    if (event === "tick" || event === "health") return;
    console.log(`[event] ${event}:`, JSON.stringify(msg).slice(0, 300));
    return;
  }

  if (msg.type === "res") {
    const cb = pending.get(msg.id as string);
    if (cb) { pending.delete(msg.id as string); cb(msg.ok as boolean, msg); }
    else { console.log("[res]", JSON.stringify(msg, null, 2)); }
  }
});

function sendReq(method: string, params: unknown): Promise<{ ok: boolean; payload: unknown }> {
  return new Promise((resolve) => {
    const id = randomUUID();
    pending.set(id, (ok, payload) => resolve({ ok, payload }));
    ws.send(JSON.stringify({ type: "req", id, method, params }));
  });
}

async function runProbes() {
  // The winning combo: message + to + idempotencyKey
  console.log("--- Probe: send({ message, to, idempotencyKey }) ---");
  const r1 = await sendReq("send", {
    message: "Hello from Lattice probe script! 🧪",
    to: "telegram:7098330193",
    channel: "telegram",
    idempotencyKey: randomUUID(),
  });
  console.log(`ok=${r1.ok}`, JSON.stringify(r1.payload, null, 2));

  console.log("\n--- Done. Closing. ---");
  ws.close();
}
