from __future__ import annotations
import asyncio
import json
import logging
from collections.abc import AsyncIterator, Iterable, Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

log = logging.getLogger(__name__)


@dataclass
class SSEEvent:
    event_id: str
    received_at: datetime
    data: dict[str, Any]


def parse_sse_lines(lines: Iterable[str]) -> Iterator[tuple[str, str]]:
    """Sync parser. Yields (event_id, data_string) once a blank line terminates a block."""
    event_id: str | None = None
    data_parts: list[str] = []
    for raw in lines:
        line = raw.rstrip("\r")
        if line == "":
            if event_id is not None and data_parts:
                yield event_id, "\n".join(data_parts)
            event_id = None
            data_parts = []
            continue
        if line.startswith(":"):
            continue
        if line.startswith("id:"):
            event_id = line[3:].strip()
        elif line.startswith("data:"):
            data_parts.append(line[5:].lstrip())


async def stream_events(
    url: str,
    *,
    last_event_id: str | None = None,
    reconnect_max: float = 30.0,
) -> AsyncIterator[SSEEvent]:
    """Long-lived SSE stream with reconnect. Yields parsed events indefinitely."""
    backoff = 1.0
    current_last_id = last_event_id
    while True:
        headers = {"Accept": "text/event-stream"}
        if current_last_id is not None:
            headers["Last-Event-ID"] = current_last_id
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("GET", url, headers=headers) as resp:
                    resp.raise_for_status()
                    log.info("SSE connected to %s (last_event_id=%s)", url, current_last_id)
                    backoff = 1.0
                    event_id: str | None = None
                    data_parts: list[str] = []
                    async for line in resp.aiter_lines():
                        if line == "":
                            if event_id is not None and data_parts:
                                raw = "\n".join(data_parts)
                                try:
                                    data = json.loads(raw)
                                except json.JSONDecodeError:
                                    log.warning("bad JSON in SSE event %s", event_id)
                                    event_id, data_parts = None, []
                                    continue
                                yield SSEEvent(
                                    event_id=event_id,
                                    received_at=datetime.now(timezone.utc),
                                    data=data,
                                )
                                current_last_id = event_id
                            event_id, data_parts = None, []
                            continue
                        if line.startswith(":"):
                            continue
                        if line.startswith("id:"):
                            event_id = line[3:].strip()
                        elif line.startswith("data:"):
                            data_parts.append(line[5:].lstrip())
        except asyncio.CancelledError:
            raise
        except httpx.HTTPError as e:
            log.warning("SSE stream error: %s; reconnecting in %.1fs", e, backoff)
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, reconnect_max)
