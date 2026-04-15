from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import text

from insights.analytics.cost import compute_cost_breakdown
from insights.analytics.routing import compute_routing_effectiveness
from insights.analytics.timeseries import compute_timeseries
from insights.db import get_sessionmaker


async def _seed(engine):
    now = datetime.now(timezone.utc) - timedelta(minutes=5)
    async with engine.begin() as conn:
        await conn.execute(
            text(
                """
                INSERT INTO tasks (
                    id,
                    status,
                    category,
                    assigned_agent,
                    latency_ms,
                    cost,
                    created_at,
                    completed_at
                )
                VALUES
                  ('1', 'completed', 'coding', 'codex', 100, 0.01, :t, :t),
                  ('2', 'completed', 'coding', 'codex', 200, 0.02, :t, :t),
                  ('3', 'failed', 'coding', 'codex', 500, 0.03, :t, :t),
                  ('4', 'completed', 'support', 'claude-code', 100, 0.04, :t, :t)
                """
            ),
            {"t": now},
        )


@pytest.mark.asyncio
async def test_timeseries_throughput(migrated_engine):
    await _seed(migrated_engine)

    async with get_sessionmaker()() as session:
        points = await compute_timeseries(
            session,
            metric="throughput",
            range_=timedelta(hours=1),
            bucket=timedelta(minutes=1),
        )

    assert sum(point["value"] for point in points) == 4


@pytest.mark.asyncio
async def test_routing_effectiveness(migrated_engine):
    await _seed(migrated_engine)

    async with get_sessionmaker()() as session:
        rows = await compute_routing_effectiveness(session, range_=timedelta(hours=1))

    coding = next(row for row in rows if row["category"] == "coding")
    assert coding["successes"] == 2
    assert coding["failures"] == 1


@pytest.mark.asyncio
async def test_cost_by_agent(migrated_engine):
    await _seed(migrated_engine)

    async with get_sessionmaker()() as session:
        rows = await compute_cost_breakdown(
            session,
            group_by="agent",
            range_=timedelta(hours=1),
        )

    by_agent = {row["key"]: float(row["cost"]) for row in rows}
    assert by_agent["codex"] == pytest.approx(0.06)
    assert by_agent["claude-code"] == pytest.approx(0.04)
