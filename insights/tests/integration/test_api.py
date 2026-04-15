import importlib
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text


def _load_app():
    from insights.config import get_settings
    import insights.db as db
    import insights.main as main

    get_settings.cache_clear()
    db._engine = None
    db._sessionmaker = None
    return importlib.reload(main).app


@pytest.mark.asyncio
async def test_overview_endpoint(migrated_engine):
    now = datetime.now(timezone.utc) - timedelta(minutes=5)
    async with migrated_engine.begin() as conn:
        await conn.execute(
            text(
                """
                INSERT INTO tasks (id, status, latency_ms, cost, created_at, completed_at)
                VALUES
                  ('a', 'completed', 100, 0.01, :t, :t),
                  ('b', 'completed', 200, 0.02, :t, :t),
                  ('c', 'failed', 500, 0.05, :t, :t)
                """
            ),
            {"t": now},
        )

    app = _load_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/insights/overview?range=1h")

    assert response.status_code == 200
    body = response.json()
    assert body["throughput"] == 3
    assert body["failed_count"] == 1


@pytest.mark.asyncio
async def test_health_endpoint(migrated_engine):
    app = _load_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/insights/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
