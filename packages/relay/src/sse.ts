import type { Request, Response } from "express";
import type { LatticeEventBus } from "./event-bus.js";
import type { SSEEventType } from "@lattice/adapter-base";

export function createSSEHandler(eventBus: LatticeEventBus) {
  return (req: Request, res: Response) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    // Only replay buffered events on reconnect (lastEventId present).
    // Fresh connections get initial state from the REST API instead.
    const lastEventId =
      req.headers["last-event-id"] ?? req.query.lastEventId;
    if (lastEventId) {
      const buffered = eventBus.getBufferedEventsAfter(
        parseInt(lastEventId as string, 10),
      );
      for (const entry of buffered) {
        writeSSE(res, entry.id, entry.event);
      }
    }

    // Flush headers and any buffered data immediately so the client sees them
    res.flushHeaders();

    // Listen for new events
    const handler = (event: SSEEventType) => {
      const latest = eventBus.getBufferedEvents();
      const entry = latest[latest.length - 1];
      if (entry) {
        writeSSE(res, entry.id, entry.event);
      }
    };

    eventBus.onAny(handler);
    req.on("close", () => { eventBus.offAny(handler); });
  };
}

function writeSSE(res: Response, id: number, event: SSEEventType) {
  res.write(`id: ${id}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
