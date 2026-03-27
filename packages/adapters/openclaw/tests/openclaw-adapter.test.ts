import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WebSocketServer } from "ws";
import { createOpenClawAdapter } from "../src/openclaw-adapter.js";
import type { Task } from "@lattice/adapter-base";

function makeTask(text: string, id = "test-task-1"): Task {
  return {
    id,
    status: "working",
    artifacts: [],
    history: [{ role: "user", parts: [{ type: "text", text }] }],
    metadata: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      assignedAgent: "openclaw",
      routingReason: "explicit",
      latencyMs: 0,
    },
  };
}

/**
 * Creates a mock OpenClaw WebSocket gateway server.
 * Simulates the connect.challenge → connect → chat.send protocol.
 */
function createMockGateway(options?: {
  onChatSend?: (params: Record<string, unknown>) => {
    responseText?: string;
    error?: string;
  };
  rejectConnect?: boolean;
  rejectHealth?: boolean;
}) {
  const wss = new WebSocketServer({ port: 0 });
  const port = (wss.address() as { port: number }).port;

  wss.on("connection", (ws) => {
    // Send connect challenge
    ws.send(
      JSON.stringify({
        type: "event",
        event: "connect.challenge",
        payload: { nonce: "test-nonce-123", ts: Date.now() },
      }),
    );

    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString()) as {
        type: string;
        id: string;
        method: string;
        params?: Record<string, unknown>;
      };

      if (msg.type !== "req") return;

      if (msg.method === "connect") {
        if (options?.rejectConnect) {
          ws.send(
            JSON.stringify({
              type: "res",
              id: msg.id,
              ok: false,
              error: { code: "AUTH_FAILED", message: "invalid token" },
            }),
          );
          return;
        }
        ws.send(
          JSON.stringify({
            type: "res",
            id: msg.id,
            ok: true,
            payload: { type: "hello-ok", protocol: 3 },
          }),
        );
        return;
      }

      if (msg.method === "health") {
        ws.send(
          JSON.stringify({
            type: "res",
            id: msg.id,
            ok: !options?.rejectHealth,
            ...(options?.rejectHealth
              ? { error: { message: "unhealthy" } }
              : { payload: {} }),
          }),
        );
        return;
      }

      if (msg.method === "chat.send") {
        const params = msg.params ?? {};
        const sessionKey = params.sessionKey as string;

        // Acknowledge the RPC
        ws.send(JSON.stringify({ type: "res", id: msg.id, ok: true, payload: {} }));

        const result = options?.onChatSend?.(params) ?? {
          responseText: "Default response",
        };

        if (result.error) {
          ws.send(
            JSON.stringify({
              type: "event",
              event: "chat",
              payload: {
                sessionKey,
                state: "error",
                errorMessage: result.error,
              },
            }),
          );
        } else {
          // Send delta then final
          ws.send(
            JSON.stringify({
              type: "event",
              event: "chat",
              payload: {
                sessionKey,
                state: "delta",
                message: {
                  role: "assistant",
                  content: result.responseText,
                },
              },
            }),
          );
          ws.send(
            JSON.stringify({
              type: "event",
              event: "chat",
              payload: {
                sessionKey,
                state: "final",
                message: {
                  role: "assistant",
                  content: result.responseText,
                },
              },
            }),
          );
        }
        return;
      }

      // Unknown method
      ws.send(
        JSON.stringify({
          type: "res",
          id: msg.id,
          ok: false,
          error: { message: `unknown method: ${msg.method}` },
        }),
      );
    });
  });

  return { wss, port };
}

describe("OpenClawAdapter", () => {
  let mockGateway: ReturnType<typeof createMockGateway> | null = null;

  afterEach(() => {
    if (mockGateway) {
      mockGateway.wss.close();
      mockGateway = null;
    }
  });

  function createAdapter(
    port: number,
    token = "test-token-123",
  ) {
    return createOpenClawAdapter({
      gatewayUrl: `http://localhost:${port}`,
      gatewayToken: token,
      deviceToken: "device-token-123",
      deviceIdentity: {
        deviceId: "device-123",
        publicKeyPem: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA7na4MEC2JcmZ6M0KBPXn1HULICwhf66A1VpzwuNFuG0=
-----END PUBLIC KEY-----`,
        privateKeyPem: `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIO0uohsEiL/KZ8nfdXbra+XUl3Bd6mVTRu6YQ8VE3d2r
-----END PRIVATE KEY-----`,
        platform: "linux",
      },
    });
  }

  describe("getAgentCard", () => {
    it("should return a valid agent card with correct skills", () => {
      const adapter = createOpenClawAdapter({
        gatewayUrl: "http://localhost:18789",
        gatewayToken: "test",
      });
      const card = adapter.getAgentCard();
      expect(card.name).toBe("openclaw");
      expect(card.capabilities.streaming).toBe(false);
      expect(card.skills.map((s) => s.id)).toEqual(
        expect.arrayContaining([
          "messaging",
          "scheduling",
          "web-browsing",
          "file-management",
        ]),
      );
    });
  });

  describe("executeTask", () => {
    it("should connect via WebSocket and return completed task", async () => {
      mockGateway = createMockGateway({
        onChatSend: () => ({ responseText: "Message sent to #general" }),
      });

      const adapter = createAdapter(mockGateway.port);
      const task = makeTask("send a message to the team");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("completed");
      expect(result.artifacts[0].parts[0].text).toBe(
        "Message sent to #general",
      );
    });

    it("should handle chat errors from gateway", async () => {
      mockGateway = createMockGateway({
        onChatSend: () => ({ error: "Agent is busy" }),
      });

      const adapter = createAdapter(mockGateway.port);
      const task = makeTask("do something");
      const result = await adapter.executeTask(task);

      // Task completes with empty text since error events don't set responseText
      expect(result.status).toBe("completed");
    });

    it("should handle connection errors", async () => {
      // Connect to a port with nothing listening
      const adapter = createAdapter(19999);
      const task = makeTask("do something");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("failed");
      expect(result.artifacts[0].parts[0].text.length).toBeGreaterThan(0);
    });

    it("should handle auth rejection", async () => {
      mockGateway = createMockGateway({ rejectConnect: true });

      const adapter = createAdapter(mockGateway.port);
      const task = makeTask("do something");
      const result = await adapter.executeTask(task);

      expect(result.status).toBe("failed");
      expect(result.artifacts[0].parts[0].text).toContain("invalid token");
    });
  });

  describe("streamTask", () => {
    it("should yield a single result from executeTask", async () => {
      mockGateway = createMockGateway({
        onChatSend: () => ({ responseText: "Streamed result" }),
      });

      const adapter = createAdapter(mockGateway.port);
      const task = makeTask("do something");
      const updates: unknown[] = [];

      for await (const update of adapter.streamTask(task)) {
        updates.push(update);
      }

      expect(updates).toHaveLength(1);
      expect(updates[0]).toMatchObject({
        taskId: "test-task-1",
        status: "completed",
      });
    });
  });

  describe("healthCheck", () => {
    it("should return { ok: true } when gateway is connected", async () => {
      mockGateway = createMockGateway();

      const adapter = createAdapter(mockGateway.port);
      const healthy = await adapter.healthCheck();
      expect(healthy).toEqual({ ok: true });
    });

    it("should return { ok: false, reason } when gateway is down", async () => {
      const adapter = createAdapter(19999);
      const healthy = await adapter.healthCheck();
      expect(healthy).toEqual({ ok: false, reason: expect.any(String) });
    });
  });
});
