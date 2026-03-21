import { EventEmitter } from "events";
import type { SSEEventType } from "@lattice/adapter-base";

export interface BufferedEvent {
  id: number;
  event: SSEEventType;
  timestamp: string;
}

export interface LatticeEventBus {
  emit(event: SSEEventType): void;
  on(type: SSEEventType["type"], handler: (event: SSEEventType) => void): void;
  onAny(handler: (event: SSEEventType) => void): void;
  off(type: SSEEventType["type"], handler: (event: SSEEventType) => void): void;
  offAny(handler: (event: SSEEventType) => void): void;
  getBufferedEvents(): BufferedEvent[];
  getBufferedEventsAfter(lastId: number): BufferedEvent[];
}

export function createEventBus(bufferSize: number = 50): LatticeEventBus {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);
  const buffer: BufferedEvent[] = [];
  let nextId = 1;

  return {
    emit(event) {
      const buffered: BufferedEvent = {
        id: nextId++,
        event,
        timestamp: new Date().toISOString(),
      };
      buffer.push(buffered);
      if (buffer.length > bufferSize) {
        buffer.shift();
      }
      emitter.emit(event.type, event);
      emitter.emit("*", event);
    },
    on(type, handler) { emitter.on(type, handler); },
    onAny(handler) { emitter.on("*", handler); },
    off(type, handler) { emitter.off(type, handler); },
    offAny(handler) { emitter.off("*", handler); },
    getBufferedEvents() { return [...buffer]; },
    getBufferedEventsAfter(lastId) { return buffer.filter((e) => e.id > lastId); },
  };
}
