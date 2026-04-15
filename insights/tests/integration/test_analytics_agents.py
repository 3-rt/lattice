from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from insights.analytics.agents import summarize_agents
from insights.db import get_sessionmaker


@pytest.mark.asyncio
async def test_agent_summary(migrated_engine):
    now = datetime.now(timezone.utc) - timedelta(minutes=10)
    async with migrated_engine.begin() as conn:
        await conn.execute(
            text(
                """
                INSERT INTO tasks (id, status, assigned_agent, latency_ms, cost, created_at, completed_at)
                VALUES
                  ('x', 'completed', 'codex', 100, 0.01, :t, :t),
                  ('y', 'completed', 'codex', 300, 0.02, :t, :t),
                  ('z', 'failed', 'codex', 400, 0.03, :t, :t),
                  ('w', 'completed', 'claude-code', 150, 0.05, :t, :t)
                """
            ),
            {"t": now},
        )

    sm = get_sessionmaker()
    async with sm() as session:
        rows = await summarize_agents(session, range_=timedelta(hours=1))

    by_agent = {row["agent"]: row for row in rows}
    assert by_agent["codex"]["task_count"] == 3
    assert by_agent["codex"]["success_rate"] == pytest.approx(2 / 3)
    assert by_agent["claude-code"]["task_count"] == 1
