from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from insights.analytics.overview import compute_overview
from insights.db import get_sessionmaker


@pytest.mark.asyncio
async def test_overview_reflects_seeded_tasks(migrated_engine):
    now = datetime.now(timezone.utc)
    async with migrated_engine.begin() as conn:
        await conn.execute(
            text(
                """
                INSERT INTO tasks (id, status, latency_ms, cost, created_at, completed_at)
                VALUES
                  ('a', 'completed', 100, 0.01, :t, :t),
                  ('b', 'completed', 200, 0.02, :t, :t),
                  ('c', 'completed', 300, 0.03, :t, :t),
                  ('d', 'failed',    500, 0.05, :t, :t)
                """
            ),
            {"t": now - timedelta(minutes=5)},
        )

    sm = get_sessionmaker()
    async with sm() as session:
        overview = await compute_overview(session, range_=timedelta(hours=1))

    assert overview["throughput"] == 4
    assert overview["failed_count"] == 1
    assert overview["success_rate"] == 0.75
    assert 100 <= (overview["p50_latency_ms"] or 0) <= 300
    assert float(overview["total_cost"]) == pytest.approx(0.11)
