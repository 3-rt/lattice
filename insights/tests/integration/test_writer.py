import pytest
from datetime import datetime, timezone
from sqlalchemy import text
from insights.db import get_sessionmaker
from insights.ingestion.handlers import handle_event
from insights.ingestion.writer import apply_actions


@pytest.mark.asyncio
async def test_writer_applies_task_lifecycle(migrated_engine):
    sm = get_sessionmaker()
    ts = datetime(2026, 4, 15, 10, 0, tzinfo=timezone.utc)

    async with sm() as s:
        await apply_actions(s, handle_event(
            event_id="1", ts=ts, type_="task:created",
            payload={"id": "t1", "status": "submitted", "createdAt": "2026-04-15T10:00:00Z"},
        ))
        await apply_actions(s, handle_event(
            event_id="2", ts=ts, type_="task:routed",
            payload={"id": "t1", "agent": "claude-code", "category": "coding"},
        ))
        await apply_actions(s, handle_event(
            event_id="3", ts=ts, type_="task:completed",
            payload={"id": "t1", "latencyMs": 1500, "cost": 0.01},
        ))
        await s.commit()

    async with migrated_engine.connect() as conn:
        row = (await conn.execute(text("SELECT status, assigned_agent, latency_ms FROM tasks WHERE id='t1'"))).first()
    assert row == ("completed", "claude-code", 1500)
