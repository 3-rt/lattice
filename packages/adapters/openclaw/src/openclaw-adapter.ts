import { randomUUID } from "node:crypto";
import WebSocket from "ws";
import type {
  LatticeAdapter,
  AgentCard,
  Task,
  TaskStatusUpdate,
  Artifact,
} from "@lattice/adapter-base";

export interface OpenClawConfig {
  gatewayUrl: string;
  gatewayToken: string;
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
 * Handles the connect.challenge → connect auth handshake,
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
    private token: string,
  ) {}

  /** Connect and authenticate. Resolves when the connect handshake completes. */
  connect(): Promise<void> {
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = new Promise<void>((resolve, reject) => {
      const wsEndpoint = `${this.wsUrl}/ws`;
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
        // Reject all pending requests
        for (const [, p] of this.pending) {
          p.reject(new Error("WebSocket closed"));
        }
        this.pending.clear();
      });

      ws.on("message", (data) => {
        let msg: GatewayMessage;
        try {
          msg = JSON.parse(data.toString()) as GatewayMessage;
        } catch {
          return;
        }

        if (msg.type === "event") {
          const event = msg as GatewayEvent;

          if (event.event === "connect.challenge") {
            // Respond to challenge with connect request
            const nonce =
              event.payload && typeof event.payload.nonce === "string"
                ? event.payload.nonce
                : undefined;
            const connectId = randomUUID();
            const connectReq = {
              type: "req",
              id: connectId,
              method: "connect",
              params: {
                minProtocol: 3,
                maxProtocol: 3,
                client: {
                  id: "gateway-client",
                  version: "1.0.0",
                  platform: "node",
                  mode: "node",
                  instanceId: randomUUID(),
                },
                role: "operator",
                scopes: ["operator.admin", "operator.read", "operator.write", "operator.approvals"],
                caps: [],
                auth: { token: this.token },
              },
            };

            // Register pending for the connect response
            this.pending.set(connectId, {
              resolve: () => {
                clearTimeout(timeout);
                this.connected = true;
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

function buildPrompt(task: Task): string {
  return task.history
    .filter((m) => m.role === "user")
    .flatMap((m) => m.parts)
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!)
    .join("\n\n");
}

export function createOpenClawAdapter(config: OpenClawConfig): LatticeAdapter {
  const wsUrl = toWsUrl(config.gatewayUrl);
  const token = config.gatewayToken;
  let client: OpenClawGatewayClient | null = null;

  async function getClient(): Promise<OpenClawGatewayClient> {
    if (client && client.isConnected()) return client;
    client?.close();
    client = new OpenClawGatewayClient(wsUrl, token);
    await client.connect();
    return client;
  }

  const adapter: LatticeAdapter = {
    getAgentCard(): AgentCard {
      return AGENT_CARD;
    },

    async executeTask(task: Task): Promise<Task> {
      const prompt = buildPrompt(task);
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
          if (!payload || payload.sessionKey !== sessionKey) return;

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

    async healthCheck(): Promise<boolean> {
      try {
        const gw = await getClient();
        return gw.isConnected();
      } catch {
        return false;
      }
    },
  };

  return adapter;
}
