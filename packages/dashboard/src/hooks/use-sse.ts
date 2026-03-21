import { useEffect, useRef } from "react";
import { useLatticeStore } from "../store/lattice-store.ts";

export function useSSE() {
  const handleSSEEvent = useLatticeStore((s) => s.handleSSEEvent);
  const setConnectionStatus = useLatticeStore((s) => s.setConnectionStatus);
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      const url = lastEventIdRef.current
        ? `/api/events?lastEventId=${lastEventIdRef.current}`
        : "/api/events";

      es = new EventSource(url);
      setConnectionStatus("connecting");

      es.onopen = () => {
        setConnectionStatus("connected");
      };

      es.onmessage = (event) => {
        if (event.lastEventId) {
          lastEventIdRef.current = event.lastEventId;
        }
        try {
          const data = JSON.parse(event.data);
          handleSSEEvent(data);
        } catch {
          // Ignore malformed events
        }
      };

      es.onerror = () => {
        setConnectionStatus("disconnected");
        es?.close();
        reconnectTimer = setTimeout(connect, 3000);
      };
    }

    connect();

    return () => {
      es?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [handleSSEEvent, setConnectionStatus]);
}
