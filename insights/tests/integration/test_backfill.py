import pytest
import respx
from httpx import Response
from sqlalchemy import text

from insights.db import get_sessionmaker
from insights.ingestion.backfill import backfill


@pytest.mark.asyncio
@respx.mock
async def test_backfill_seeds_tasks_and_agents(migrated_engine):
    respx.get("http://relay/api/tasks").mock(return_value=Response(200, json=[
        {"id": "t1", "status": "completed", "assigned_agent": "codex",
         "latency_ms": 500, "cost": 0.001, "created_at": "2026-04-15T10:00:00Z",
         "completed_at": "2026-04-15T10:00:00.5Z"},
    ]))
    respx.get("http://relay/api/agents").mock(return_value=Response(200, json=[
        {"name": "codex", "status": "online"},
    ]))

    sm = get_sessionmaker()
    async with sm() as s:
        await backfill(s, relay_url="http://relay")
        await s.commit()

    async with migrated_engine.connect() as conn:
        tasks = (await conn.execute(text("SELECT id, status FROM tasks"))).all()
        hist = (await conn.execute(text("SELECT agent, status FROM agent_status_history"))).all()
    assert tasks == [("t1", "completed")]
    assert hist == [("codex", "online")]
