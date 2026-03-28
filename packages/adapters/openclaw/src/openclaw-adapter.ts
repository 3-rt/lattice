import { randomUUID } from "node:crypto";
import crypto from "node:crypto";
import WebSocket from "ws";
import type {
  LatticeAdapter,
  AgentCard,
  Task,
  TaskStatusUpdate,
  Artifact,
  HealthCheckResult,
} from "@lattice/adapter-base";

export interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  /** Platform the device was paired from (e.g. "linux"). Used in signed auth payload. */
  platform: string;
}

export interface InboundMessage {
  text: string;
  sessionKey: string;
  sender: string;
  channel: string;
  /** Channel-qualified target for replies, e.g. "telegram:7098330193" */
  from: string;
}

export type InboundHandler = (message: InboundMessage) => void;

export interface BridgeConfig {
  enabled?: boolean;
  triggerPrefix?: string;
  ackMessage?: string;
}

export interface OpenClawConfig {
  gatewayUrl: string;
  /** Static gateway auth token (authenticates the WebSocket connection). */
  gatewayToken: string;
  /** Scoped device token from `openclaw devices rotate` (carries operator scopes). */
  deviceToken: string;
  /** Device identity with Ed25519 keypair for signing the connect handshake. */
  deviceIdentity: DeviceIdentity;
  /**
   * Prompt prefix prepended to every task to give the agent context about
   * available tools/integrations. Set to "" to disable.
   */
  promptPrefix?: string;
  bridge?: BridgeConfig;
}

function hasRequiredDeviceAuth(config: Pick<OpenClawConfig, "gatewayToken" | "deviceToken" | "deviceIdentity">): boolean {
  const { gatewayToken, deviceToken, deviceIdentity } = config;
  return Boolean(
    gatewayToken &&
      deviceToken &&
      deviceIdentity?.deviceId &&
      deviceIdentity?.publicKeyPem &&
      deviceIdentity?.privateKeyPem &&
      deviceIdentity?.platform,
  );
}

const AGENT_CARD: AgentCard = {
  name: "openclaw",
  description:
    "OpenClaw — multi-tool AI agent for messaging, scheduling, and web tasks",
  url: "http://localhost:3100/a2a/agents/openclaw",
  version: "1.0.0",
  capabilities: { streaming: false, pushNotifications: false },
  skills: [
    {
      id: "messaging",
      name: "Messaging",
      description: "Send messages via Telegram, Slack, etc.",
      tags: ["message", "send", "notify", "telegram", "slack"],
    },
    {
      id: "scheduling",
      name: "Scheduling",
      description: "Schedule tasks and reminders",
      tags: ["schedule", "reminder", "calendar", "timer"],
    },
    {
      id: "web-browsing",
      name: "Web Browsing",
      description: "Browse and extract web content",
      tags: ["browse", "web", "search", "scrape", "fetch"],
    },
    {
      id: "file-management",
      name: "File Management",
      description: "Manage files and documents",
      tags: ["file", "document", "upload", "download"],
    },
  ],
  authentication: { schemes: ["bearer"] },
};

/** Convert an http(s) URL to ws(s), or leave ws(s) as-is. */
function toWsUrl(url: string): string {
  return url
    .replace(/^http:\/\//, "ws://")
    .replace(/^https:\/\//, "wss://")
    .replace(/\/$/, "");
}

/** Extract text from an OpenClaw chat message payload. */
function extractText(message: unknown): string | null {
  if (!message || typeof message !== "object") return null;
  const msg = message as Record<string, unknown>;
  const content = msg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = content
      .filter(
        (c: unknown) =>
          typeof c === "object" &&
          c !== null &&
          (c as Record<string, unknown>).type === "text" &&
          typeof (c as Record<string, unknown>).text === "string",
      )
      .map((c: unknown) => (c as Record<string, string>).text);
    return texts.length > 0 ? texts.join("") : null;
  }
  return null;
}

/**
 * Strip OpenClaw metadata preamble from inbound channel messages.
 * Telegram messages arrive wrapped with "Conversation info" and "Sender" JSON blocks.
 * Strategy: find the last closing triple-backtick, take everything after it.
 */
function extractUserText(raw: string): string {
  const lastFence = raw.lastIndexOf("```");
  if (lastFence === -1) return raw.trim();
  const afterFence = raw.slice(lastFence + 3).trim();
  return afterFence || raw.trim();
}

/** Extract sender display name from session origin metadata. */
function extractSenderName(session: Record<string, unknown> | undefined): string {
  if (!session) return "Unknown";
  const origin = session.origin as Record<string, unknown> | undefined;
  if (!origin) return "Unknown";
  const label = origin.label;
  return typeof label === "string" ? label : "Unknown";
}

// ---------------------------------------------------------------------------
// Device-signing helpers (OpenClaw V3 auth protocol)
// ---------------------------------------------------------------------------

const CLIENT_ID = "gateway-client";
const CLIENT_MODE = "backend";
const ROLE = "operator";
const SCOPES = ["operator.admin", "operator.read", "operator.write", "operator.approvals"];

function base64UrlEncode(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Reproduce buildDeviceAuthPayloadV3 — pipe-delimited string of auth fields. */
function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string;
  nonce: string;
  platform: string;
  deviceFamily: string | null;
}): string {
  return [
    "v3",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(","),
    String(params.signedAtMs),
    params.token ?? "",
    params.nonce,
    params.platform ?? "",
    params.deviceFamily ?? "",
  ].join("|");
}

/** Ed25519 sign over the UTF-8 payload, return base64url. */
function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem);
  return base64UrlEncode(
    crypto.sign(null, Buffer.from(payload, "utf8"), key),
  );
}

/** Extract raw 32-byte Ed25519 public key from PEM, return base64url. */
function publicKeyRawBase64Url(publicKeyPem: string): string {
  const spki = crypto.createPublicKey(publicKeyPem).export({ type: "spki", format: "der" });
  // Ed25519 SPKI is 44 bytes: 12-byte header + 32-byte raw key
  const raw = spki.subarray(-32);
  return base64UrlEncode(raw);
}

// ---------------------------------------------------------------------------
// WebSocket client
// ---------------------------------------------------------------------------

interface GatewayMessage {
  type: string;
  [key: string]: unknown;
}

interface GatewayEvent extends GatewayMessage {
  type: "event";
  event: string;
  payload?: Record<string, unknown>;
}

interface GatewayResponse extends GatewayMessage {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { message: string };
}

/**
 * Manages a single WebSocket connection to the OpenClaw gateway.
 * Handles the connect.challenge → signed connect auth handshake,
 * and exposes an RPC request() method.
 */
class OpenClawGatewayClient {
  private ws: WebSocket | null = null;
  private pending = new Map<
    string,
    {
      resolve: (v: unknown) => void;
      reject: (e: Error) => void;
    }
  >();
  private eventListeners: Array<(event: GatewayEvent) => void> = [];
  private connected = false;
  private connectPromise: Promise<void> | null = null;

  constructor(
    private wsUrl: string,
    private gatewayToken: string,
    private deviceToken: string,
    private identity: DeviceIdentity,
  ) {}

  /** Connect and authenticate with signed device identity. */
  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const wsEndpoint = this.wsUrl;
      const ws = new WebSocket(wsEndpoint);
      this.ws = ws;

      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error("OpenClaw gateway connection timeout"));
      }, 15_000);

      ws.on("error", (err) => {
        clearTimeout(timeout);
        const code = (err as NodeJS.ErrnoException).code;
        const msg = err.message || code || "WebSocket connection failed";
        reject(new Error(msg));
      });

      ws.on("close", () => {
        this.connected = false;
        this.ws = null;
        for (const [, p] of this.pending) {
          p.reject(new Error("WebSocket closed"));
        }
        this.pending.clear();
      });

      ws.on("message", (data) => {
        const raw = data.toString();
        let msg: GatewayMessage;
        try {
          msg = JSON.parse(raw) as GatewayMessage;
        } catch {
          return;
        }

        if (msg.type === "event") {
          const event = msg as GatewayEvent;

          if (event.event === "connect.challenge") {
            const nonce =
              event.payload && typeof event.payload.nonce === "string"
                ? event.payload.nonce
                : undefined;
            if (!nonce) {
              clearTimeout(timeout);
              reject(new Error("connect.challenge missing nonce"));
              return;
            }

            // Build signed connect request
            const signedAtMs = Date.now();
            const payload = buildDeviceAuthPayloadV3({
              deviceId: this.identity.deviceId,
              clientId: CLIENT_ID,
              clientMode: CLIENT_MODE,
              role: ROLE,
              scopes: SCOPES,
              signedAtMs,
              token: this.gatewayToken,
              nonce,
              platform: this.identity.platform,
              deviceFamily: null,
            });
            const signature = signDevicePayload(this.identity.privateKeyPem, payload);

            const connectId = randomUUID();
            const connectReq = {
              type: "req",
              id: connectId,
              method: "connect",
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: CLIENT_ID,
                  version: "1.0.0",
                  platform: this.identity.platform,
                  mode: CLIENT_MODE,
                  instanceId: randomUUID(),
                },
                role: ROLE,
                scopes: SCOPES,
                caps: [],
                auth: {
                  token: this.gatewayToken,
                  deviceToken: this.deviceToken,
                },
                device: {
                  id: this.identity.deviceId,
                  publicKey: publicKeyRawBase64Url(this.identity.publicKeyPem),
                  signature,
                  signedAt: signedAtMs,
                  nonce,
                },
              },
            };

            this.pending.set(connectId, {
              resolve: () => {
                clearTimeout(timeout);
                this.connected = true;
                // Auto-subscribe to session events for bridge functionality
                this.subscribeToSessions().catch(() => {
                  // Non-fatal — bridge features won't work but task execution still will
                });
                resolve();
              },
              reject: (err) => {
                clearTimeout(timeout);
                reject(err);
              },
            });

            ws.send(JSON.stringify(connectReq));
            return;
          }

          // Dispatch to event listeners
          for (const listener of this.eventListeners) {
            listener(event);
          }
          return;
        }

        if (msg.type === "res") {
          const res = msg as GatewayResponse;
          const p = this.pending.get(res.id);
          if (!p) return;
          this.pending.delete(res.id);
          if (res.ok) {
            p.resolve(res.payload);
          } else {
            p.reject(
              new Error(res.error?.message ?? "OpenClaw request failed"),
            );
          }
        }
      });
    });

    return this.connectPromise;
  }

  /** Send an RPC request and wait for the response. */
  async request(method: string, params: unknown): Promise<unknown> {
    if (!this.ws || !this.connected) {
      throw new Error("OpenClaw gateway not connected");
    }
    const id = randomUUID();
    const req = { type: "req", id, method, params };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws!.send(JSON.stringify(req));
    });
  }

  /** Subscribe to gateway events. Returns an unsubscribe function. */
  onEvent(listener: (event: GatewayEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      this.eventListeners = this.eventListeners.filter((l) => l !== listener);
    };
  }

  /** Subscribe to session lifecycle and message events. */
  async subscribeToSessions(): Promise<void> {
    await this.request("sessions.subscribe", {});
  }

  /** Abort the active response on a session. */
  async abortSession(sessionKey: string): Promise<void> {
    await this.request("chat.abort", { sessionKey });
  }

  /** Send a message to a session (agent-oriented, no channel delivery). */
  async sendMessage(sessionKey: string, message: string): Promise<void> {
    await this.request("chat.send", {
      sessionKey,
      message,
      deliver: false,
      idempotencyKey: randomUUID(),
    });
  }

  /** Send a message directly to a channel target (e.g. Telegram user). */
  async sendDirect(to: string, channel: string, message: string): Promise<void> {
    await this.request("send", {
      message,
      to,
      channel,
      idempotencyKey: randomUUID(),
    });
  }

  /** Close the WebSocket connection. */
  close(): void {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.connectPromise = null;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

const DEFAULT_PROMPT_PREFIX =
  "Use all available tools and integrations on this host (Google Drive, Gmail, Telegram, web browsing, file management, scheduling, etc.) as needed to complete the task. Do not ask for confirmation — just do it.\n\n";

function buildPrompt(task: Task, promptPrefix: string): string {
  const userText = task.history
    .filter((m) => m.role === "user")
    .flatMap((m) => m.parts)
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!)
    .join("\n\n");
  return promptPrefix + userText;
}

export function createOpenClawAdapter(config: OpenClawConfig): LatticeAdapter & {
  onInboundMessage(handler: InboundHandler): void;
  sendToSession(sessionKey: string, text: string): Promise<void>;
  sendDirectToChannel(to: string, channel: string, text: string): Promise<void>;
} {
  const wsUrl = toWsUrl(config.gatewayUrl);
  const { gatewayToken, deviceToken, deviceIdentity } = config;
  const hasDeviceAuth = hasRequiredDeviceAuth(config);
  const promptPrefix = config.promptPrefix ?? DEFAULT_PROMPT_PREFIX;
  const inboundHandlers: InboundHandler[] = [];
  const bridgeConfig = config.bridge ?? {};
  const bridgeEnabled = bridgeConfig.enabled !== false;
  const triggerPrefix = (bridgeConfig.triggerPrefix ?? "BUG:").toUpperCase();
  const ackMessage = bridgeConfig.ackMessage ?? "Bug received. Investigating across agents...";
  let client: OpenClawGatewayClient | null = null;

  function setupBridge(gw: OpenClawGatewayClient) {
    gw.onEvent((event) => {
      if (event.event !== "session.message") return;
      const payload = event.payload;
      if (!payload) return;

      const message = payload.message as Record<string, unknown> | undefined;
      if (!message || message.role !== "user") return;

      // Extract text from content array
      const content = message.content as Array<Record<string, unknown>> | undefined;
      const rawText = content?.[0]?.text;
      if (typeof rawText !== "string") return;

      const userText = extractUserText(rawText);
      if (!userText.toUpperCase().startsWith(triggerPrefix)) return;

      const sessionKey = payload.sessionKey as string;
      const session = payload.session as Record<string, unknown> | undefined;
      const origin = session?.origin as Record<string, unknown> | undefined;
      const channel = (origin?.provider as string) ?? "unknown";
      const from = (origin?.from as string) ?? "";
      const sender = extractSenderName(session);
      const bugText = userText.slice(triggerPrefix.length).trim();

      // Abort auto-response and send ack directly to channel
      gw.abortSession(sessionKey).catch(() => {});
      if (from && channel !== "unknown") {
        gw.sendDirect(from, channel, ackMessage).catch(() => {});
      }

      // Notify registered handlers
      for (const handler of inboundHandlers) {
        try {
          handler({ text: bugText, sessionKey, sender, channel, from });
        } catch { /* handler errors should not crash the bridge */ }
      }
    });
  }

  async function getClient(): Promise<OpenClawGatewayClient> {
    if (!hasDeviceAuth) {
      throw new Error(
        "Gateway token, device token, and device identity are required. Set OPENCLAW_GATEWAY_TOKEN, OPENCLAW_DEVICE_TOKEN, and a valid device identity file.",
      );
    }
    if (client && client.isConnected()) return client;
    client?.close();
    client = new OpenClawGatewayClient(wsUrl, gatewayToken, deviceToken, deviceIdentity);
    await client.connect();
    if (bridgeEnabled) {
      setupBridge(client);
    }
    return client;
  }

  const adapter: LatticeAdapter = {
    getAgentCard(): AgentCard {
      return AGENT_CARD;
    },

    async executeTask(task: Task): Promise<Task> {
      const prompt = buildPrompt(task, promptPrefix);
      const sessionKey = `lattice-${task.id}`;
      const runId = randomUUID();

      try {
        const gw = await getClient();

        // Collect streamed response
        let responseText = "";
        let done = false;

        const unsubscribe = gw.onEvent((event) => {
          if (event.event !== "chat") return;
          const payload = event.payload;
          const payloadKey = typeof payload?.sessionKey === "string" ? payload.sessionKey : "";
          if (!payload || (!payloadKey.endsWith(sessionKey) && payloadKey !== sessionKey)) return;

          if (payload.state === "delta") {
            const text = extractText(payload.message);
            if (text !== null) responseText = text;
          } else if (
            payload.state === "final" ||
            payload.state === "error" ||
            payload.state === "aborted"
          ) {
            if (payload.state === "final") {
              const text = extractText(payload.message);
              if (text !== null) responseText = text;
            }
            done = true;
          }
        });

        // Send the chat message
        await gw.request("chat.send", {
          sessionKey,
          message: prompt,
          deliver: false,
          idempotencyKey: runId,
        });

        // Wait for the final event (up to 5 minutes)
        const deadline = Date.now() + 300_000;
        while (!done && Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 100));
        }

        unsubscribe();

        if (!done) {
          return {
            ...task,
            status: "failed",
            artifacts: [
              {
                name: "error",
                parts: [{ type: "text", text: "OpenClaw response timed out" }],
              },
            ],
          };
        }

        const artifact: Artifact = {
          name: "result",
          parts: [{ type: "text", text: responseText }],
        };
        return { ...task, status: "completed", artifacts: [artifact] };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        return {
          ...task,
          status: "failed",
          artifacts: [
            { name: "error", parts: [{ type: "text", text: errorMsg }] },
          ],
        };
      }
    },

    async *streamTask(task: Task): AsyncGenerator<TaskStatusUpdate> {
      const result = await adapter.executeTask(task);
      yield {
        taskId: task.id,
        status: result.status,
        message: result.artifacts[0]?.parts[0]?.text,
        artifacts: result.artifacts,
      };
    },

    async healthCheck(): Promise<HealthCheckResult> {
      if (!hasDeviceAuth) {
        return {
          ok: false,
          reason:
            "Gateway token, device token, or device identity not configured. Set OPENCLAW_GATEWAY_TOKEN, OPENCLAW_DEVICE_TOKEN, and a valid device identity file.",
        };
      }
      try {
        const gw = await getClient();
        if (!gw.isConnected()) {
          return { ok: false, reason: `Can't reach OpenClaw gateway at ${wsUrl}. Check that the gateway is running.` };
        }
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/timeout/i.test(msg)) {
          return { ok: false, reason: `Can't reach OpenClaw gateway at ${wsUrl}. Check that the gateway is running.` };
        }
        if (/rejected|auth|scope|mismatch|unauthorized/i.test(msg)) {
          return { ok: false, reason: `Gateway auth failed: ${msg}` };
        }
        return { ok: false, reason: msg };
      }
    },
  };

  return Object.assign(adapter, {
    onInboundMessage(handler: InboundHandler): void {
      inboundHandlers.push(handler);
    },
    async sendToSession(sessionKey: string, text: string): Promise<void> {
      const gw = await getClient();
      await gw.sendMessage(sessionKey, text);
    },
    async sendDirectToChannel(to: string, channel: string, text: string): Promise<void> {
      const gw = await getClient();
      await gw.sendDirect(to, channel, text);
    },
  });
}
