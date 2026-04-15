import asyncio
import json

import pytest
from aiohttp import web
from sqlalchemy import text

from insights.ingestion.orchestrator import _run_stream


@pytest.mark.asyncio
async def test_stream_ingests_events(migrated_engine, monkeypatch):
    async def events(_request):
        response = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
        await response.prepare(_request)
        payload = {
            "type": "task:created",
            "payload": {
                "id": "t-e2e",
                "status": "submitted",
                "createdAt": "2026-04-15T10:00:00Z",
            },
        }
        await response.write(f"id: 1\ndata: {json.dumps(payload)}\n\n".encode())
        await asyncio.sleep(0.5)
        return response

    async def tasks(_request):
        return web.json_response([])

    async def agents(_request):
        return web.json_response([])

    app = web.Application()
    app.router.add_get("/api/events", events)
    app.router.add_get("/api/tasks", tasks)
    app.router.add_get("/api/agents", agents)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    port = site._server.sockets[0].getsockname()[1]

    monkeypatch.setenv("INSIGHTS_RELAY_URL", f"http://127.0.0.1:{port}")
    from insights.config import get_settings

    get_settings.cache_clear()

    stream_task = asyncio.create_task(_run_stream())
    try:
        await asyncio.sleep(1.5)
    finally:
        stream_task.cancel()
        try:
            await stream_task
        except BaseException:
            pass
        await runner.cleanup()

    async with migrated_engine.connect() as conn:
        row = (
            await conn.execute(text("SELECT id FROM tasks WHERE id='t-e2e'"))
        ).first()
    assert row is not None
