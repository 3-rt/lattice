from __future__ import annotations
import asyncio
import logging
from contextlib import asynccontextmanager

from sqlalchemy import select, desc

from ..config import get_settings
from ..db import session_scope
from .. import models
from .backfill import backfill
from .handlers import handle_event
from .sse_client import stream_events
from .writer import apply_actions

log = logging.getLogger(__name__)


async def _load_last_event_id() -> str | None:
    async with session_scope() as s:
        r = await s.execute(
            select(models.Event.event_id).order_by(desc(models.Event.ts)).limit(1)
        )
        row = r.first()
        return row[0] if row else None


async def _run_stream() -> None:
    settings = get_settings()
    last_id = await _load_last_event_id()
    url = f"{settings.relay_url.rstrip('/')}/api/events"
    async for ev in stream_events(url, last_event_id=last_id):
        data = ev.data
        type_ = data.get("type") or data.get("event")
        payload = data.get("payload") or data.get("data") or data
        if not type_:
            continue
        actions = handle_event(event_id=ev.event_id, ts=ev.received_at,
                                type_=type_, payload=payload)
        try:
            async with session_scope() as s:
                await apply_actions(s, actions)
        except Exception:
            log.exception("failed to apply event %s", ev.event_id)


@asynccontextmanager
async def ingestion_lifespan():
    """Runs backfill then starts the streaming task. Cancels on exit."""
    settings = get_settings()
    try:
        async with session_scope() as s:
            await backfill(s, relay_url=settings.relay_url)
    except Exception:
        log.exception("backfill failed; continuing to stream")

    task = asyncio.create_task(_run_stream(), name="insights-sse-stream")
    try:
        yield task
    finally:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass
