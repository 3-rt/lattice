import os
import subprocess
import pytest
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from testcontainers.postgres import PostgresContainer


@pytest.fixture(scope="session")
def postgres_container():
    container = (
        PostgresContainer("timescale/timescaledb:latest-pg16")
        .with_env("POSTGRES_USER", "insights")
        .with_env("POSTGRES_PASSWORD", "insights")
        .with_env("POSTGRES_DB", "insights")
    )
    container.start()
    yield container
    container.stop()


@pytest.fixture(scope="session")
def database_url(postgres_container):
    raw = postgres_container.get_connection_url()
    return raw.replace("postgresql+psycopg2", "postgresql+asyncpg").replace(
        "postgresql://", "postgresql+asyncpg://"
    )


@pytest.fixture(scope="session", autouse=True)
def set_env(database_url):
    os.environ["INSIGHTS_DATABASE_URL"] = database_url
    from insights.config import get_settings
    get_settings.cache_clear()
    yield


@pytest.fixture(scope="session")
def _run_migrations(database_url, set_env):
    env = {**os.environ, "INSIGHTS_DATABASE_URL": database_url}
    result = subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        check=False,
        env=env,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"alembic upgrade failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    return True


@pytest.fixture
async def migrated_engine(database_url, _run_migrations):
    engine = create_async_engine(database_url)
    yield engine
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_tables(migrated_engine):
    async with migrated_engine.begin() as conn:
        await conn.execute(
            text("TRUNCATE events, tasks, agent_status_history RESTART IDENTITY")
        )
    yield
