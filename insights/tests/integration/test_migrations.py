import pytest
from sqlalchemy import text


@pytest.mark.asyncio
async def test_hypertables_exist(migrated_engine):
    async with migrated_engine.connect() as conn:
        result = await conn.execute(
            text("SELECT hypertable_name FROM timescaledb_information.hypertables")
        )
        names = {row[0] for row in result.fetchall()}
    assert "events" in names
    assert "agent_status_history" in names


@pytest.mark.asyncio
async def test_tables_queryable(migrated_engine):
    async with migrated_engine.connect() as conn:
        for t in ("events", "tasks", "agent_status_history"):
            await conn.execute(text(f"SELECT 1 FROM {t} LIMIT 1"))
