import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import express from "express";
import { createSSEHandler } from "../src/sse.js";
import { createEventBus } from "../src/event-bus.js";
import http from "http";

describe("SSE Handler", () => {
  let app: express.Express;
  let server: http.Server;
  let bus: ReturnType<typeof createEventBus>;
  let baseUrl: string;

  beforeEach(async () => {
    bus = createEventBus();
    app = express();
    const sseHandler = createSSEHandler(bus);
    app.get("/api/events", sseHandler);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://localhost:${addr.port}`;
        resolve();
      });
    });
  });

  afterEach(() => {
    server.close();
  });

  it("should set correct SSE headers", async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("connection")).toBe("keep-alive");
    res.body?.cancel();
  });

  it("should stream events as SSE formatted data", async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    await new Promise((r) => setTimeout(r, 50));
    bus.emit({ type: "agent:status", agentName: "test", status: "online" });

    let data = "";
    const timeout = setTimeout(() => reader.cancel(), 2000);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        data += decoder.decode(value);
        if (data.includes("agent:status")) break;
      }
    } finally {
      clearTimeout(timeout);
      reader.cancel();
    }

    expect(data).toContain("event: agent:status");
    expect(data).toContain('"agentName":"test"');
  });

  it("should not replay buffered events on fresh connect", async () => {
    bus.emit({ type: "agent:status", agentName: "pre-1", status: "online" });
    bus.emit({ type: "agent:status", agentName: "pre-2", status: "online" });

    const res = await fetch(`${baseUrl}/api/events`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Emit a new event after connecting so we have something to read
    await new Promise((r) => setTimeout(r, 50));
    bus.emit({ type: "agent:status", agentName: "post-connect", status: "online" });

    let data = "";
    const timeout = setTimeout(() => reader.cancel(), 2000);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        data += decoder.decode(value);
        if (data.includes("post-connect")) break;
      }
    } finally {
      clearTimeout(timeout);
      reader.cancel();
    }

    expect(data).toContain("post-connect");
    expect(data).not.toContain("pre-1");
    expect(data).not.toContain("pre-2");
  });

  it("should replay missed events on reconnect with lastEventId", async () => {
    bus.emit({ type: "agent:status", agentName: "pre-1", status: "online" });
    bus.emit({ type: "agent:status", agentName: "pre-2", status: "online" });

    // Reconnect with lastEventId=1, should only get event 2
    const res = await fetch(`${baseUrl}/api/events?lastEventId=1`);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    let data = "";
    const timeout = setTimeout(() => reader.cancel(), 2000);
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        data += decoder.decode(value);
        if (data.includes("pre-2")) break;
      }
    } finally {
      clearTimeout(timeout);
      reader.cancel();
    }

    expect(data).not.toContain("pre-1");
    expect(data).toContain("pre-2");
  });
});
