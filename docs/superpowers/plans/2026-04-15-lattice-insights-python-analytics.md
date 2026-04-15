# Lattice Insights — Python Analytics Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone Python/FastAPI service that ingests the Lattice relay's SSE event stream into TimescaleDB and exposes analytics REST endpoints consumed by the existing React dashboard.

**Architecture:** Single Python 3.12 process (FastAPI + uvicorn) running an async SSE ingestor alongside an HTTP API, both backed by an `asyncpg`/SQLAlchemy 2.0 async engine pointed at Postgres 16 with the TimescaleDB extension. Postgres runs in Docker Compose. The dashboard gains a new `/insights` route that calls the Python service over REST with CORS enabled.

**Tech Stack:** Python 3.12, uv, FastAPI, uvicorn, SQLAlchemy 2.0 (async), asyncpg, Alembic, httpx, pydantic-settings, pytest + pytest-asyncio, testcontainers-python, Postgres 16 + TimescaleDB, Docker Compose, Recharts (added to dashboard).

**Spec:** `docs/superpowers/specs/2026-04-15-lattice-insights-python-analytics-design.md`

---

## File Structure

Top-level `insights/` directory (not an npm workspace — fully separate Python project):

```
insights/
├── pyproject.toml                     # uv-managed deps + tool config
├── uv.lock
├── Dockerfile
├── docker-compose.yml                 # postgres-timescale + insights service
├── .env.example
├── alembic.ini
├── alembic/env.py
├── alembic/versions/                  # generated migrations
├── README.md
├── src/insights/
│   ├── __init__.py
│   ├── main.py                        # FastAPI app + lifespan
│   ├── config.py                      # pydantic-settings
│   ├── db.py                          # async engine + session
│   ├── models.py                      # SQLAlchemy ORM models
│   ├── schemas.py                     # Pydantic response models
│   ├── time_utils.py                  # range/bucket parsing
│   ├── ingestion/
│   │   ├── __init__.py
│   │   ├── sse_client.py              # async SSE parser + reconnect
│   │   ├── backfill.py                # REST-based seed
│   │   ├── handlers.py                # event payload → rows
│   │   └── orchestrator.py            # wires backfill + stream into lifespan
│   ├── analytics/
│   │   ├── __init__.py
│   │   ├── overview.py
│   │   ├── agents.py
│   │   ├── routing.py
│   │   └── timeseries.py
│   └── api/
│       ├── __init__.py
│       └── routers/
│           ├── __init__.py
│           ├── health.py
│           ├── overview.py
│           ├── agents.py
│           ├── routing.py
│           └── timeseries.py
└── tests/
    ├── conftest.py                    # testcontainers Postgres fixture
    ├── unit/
    │   ├── test_handlers.py
    │   ├── test_time_utils.py
    │   └── test_sse_parser.py
    ├── integration/
    │   ├── test_migrations.py
    │   ├── test_backfill.py
    │   ├── test_analytics_overview.py
    │   ├── test_analytics_agents.py
    │   └── test_api.py
    └── e2e/
        └── test_smoke.py
```

Dashboard-side additions:
- `packages/dashboard/package.json` — add `recharts`
- `packages/dashboard/src/lib/insights-api.ts`
- `packages/dashboard/src/pages/insights.tsx`
- `packages/dashboard/src/App.tsx` (modify — add route)
- `packages/dashboard/src/components/layout/sidebar.tsx` (modify — add nav item)

---

## Task 1: Project scaffold

**Files:**
- Create: `insights/pyproject.toml`
- Create: `insights/.env.example`
- Create: `insights/README.md`
- Create: `insights/src/insights/__init__.py`

- [ ] **Step 1: Create `insights/pyproject.toml`**

```toml
[project]
name = "insights"
version = "0.1.0"
description = "Lattice analytics service"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.32",
  "sqlalchemy[asyncio]>=2.0.36",
  "asyncpg>=0.30",
  "alembic>=1.14",
  "httpx>=0.28",
  "pydantic>=2.9",
  "pydantic-settings>=2.6",
  "python-dateutil>=2.9",
]

[project.optional-dependencies]
dev = [
  "pytest>=8.3",
  "pytest-asyncio>=0.24",
  "testcontainers[postgres]>=4.8",
  "httpx>=0.28",
  "ruff>=0.7",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/insights"]

[tool.pytest.ini_options]
asyncio_mode = "auto"
testpaths = ["tests"]

[tool.ruff]
line-length = 100
target-version = "py312"
```

- [ ] **Step 2: Create `insights/.env.example`**

```
INSIGHTS_DATABASE_URL=postgresql+asyncpg://insights:insights@localhost:5433/insights
INSIGHTS_RELAY_URL=http://localhost:3100
INSIGHTS_PORT=8000
INSIGHTS_LOG_LEVEL=INFO
INSIGHTS_CORS_ORIGINS=http://localhost:3200
INSIGHTS_EVENTS_RETENTION_DAYS=30
```

- [ ] **Step 3: Create `insights/README.md`** (short — purpose, quickstart)

```markdown
# Lattice Insights

Python analytics service for the Lattice control plane. Ingests relay events via
SSE into TimescaleDB and exposes analytics over REST.

## Quickstart

    cd insights
    cp .env.example .env
    docker compose up -d postgres
    uv sync --dev
    uv run alembic upgrade head
    uv run uvicorn insights.main:app --reload --port 8000

Dashboard at http://localhost:3200/insights will display the data once the relay
is running at :3100 and has produced some tasks.

## Tests

    uv run pytest
```

- [ ] **Step 4: Create empty package init**

```python
# insights/src/insights/__init__.py
__version__ = "0.1.0"
```

- [ ] **Step 5: Install and verify**

Run: `cd insights && uv sync --dev`
Expected: `.venv` created, deps installed, no errors.

- [ ] **Step 6: Commit**

```bash
git add insights/pyproject.toml insights/.env.example insights/README.md insights/src/insights/__init__.py insights/uv.lock insights/.python-version
git commit -m "chore(insights): scaffold Python project with uv"
```

---

## Task 2: Config module

**Files:**
- Create: `insights/src/insights/config.py`
- Test: `insights/tests/unit/test_config.py`

- [ ] **Step 1: Write failing test**

```python
# tests/unit/test_config.py
import os
from insights.config import Settings

def test_defaults(monkeypatch):
    monkeypatch.delenv("INSIGHTS_DATABASE_URL", raising=False)
    monkeypatch.setenv("INSIGHTS_DATABASE_URL", "postgresql+asyncpg://u:p@h/db")
    s = Settings()
    assert s.port == 8000
    assert s.relay_url == "http://localhost:3100"
    assert s.cors_origins == ["http://localhost:3200"]
    assert s.events_retention_days == 30

def test_cors_csv(monkeypatch):
    monkeypatch.setenv("INSIGHTS_DATABASE_URL", "postgresql+asyncpg://u:p@h/db")
    monkeypatch.setenv("INSIGHTS_CORS_ORIGINS", "http://a,http://b")
    s = Settings()
    assert s.cors_origins == ["http://a", "http://b"]
```

- [ ] **Step 2: Run and verify failure**

Run: `cd insights && uv run pytest tests/unit/test_config.py -v`
Expected: ImportError / module not found.

- [ ] **Step 3: Implement config**

```python
# src/insights/config.py
from functools import lru_cache
from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="INSIGHTS_",
        env_file=".env",
        extra="ignore",
    )

    database_url: str
    relay_url: str = "http://localhost:3100"
    port: int = 8000
    log_level: str = "INFO"
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3200"])
    events_retention_days: int = 30

    @field_validator("cors_origins", mode="before")
    @classmethod
    def split_csv(cls, v):
        if isinstance(v, str):
            return [x.strip() for x in v.split(",") if x.strip()]
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 4: Run tests to verify pass**

Run: `uv run pytest tests/unit/test_config.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add insights/src/insights/config.py insights/tests/unit/test_config.py
git commit -m "feat(insights): add env-driven settings module"
```

---

## Task 3: SQLAlchemy models + async engine

**Files:**
- Create: `insights/src/insights/db.py`
- Create: `insights/src/insights/models.py`

- [ ] **Step 1: Implement `models.py`**

```python
# src/insights/models.py
from __future__ import annotations
from datetime import datetime
from decimal import Decimal
from sqlalchemy import BigInteger, Integer, Numeric, String, Text, DateTime, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class Event(Base):
    __tablename__ = "events"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    event_id: Mapped[str] = mapped_column(Text, nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, primary_key=True)
    type: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict] = mapped_column(JSONB, nullable=False)

    __table_args__ = (
        UniqueConstraint("event_id", "ts", name="uq_events_event_id_ts"),
    )


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(Text, primary_key=True)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str | None] = mapped_column(Text)
    assigned_agent: Mapped[str | None] = mapped_column(Text)
    routing_reason: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 6))
    workflow_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AgentStatusHistory(Base):
    __tablename__ = "agent_status_history"
    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    agent: Mapped[str] = mapped_column(Text, nullable=False)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, primary_key=True)
    status: Mapped[str] = mapped_column(Text, nullable=False)
```

Note: Timescale's compound primary key pattern — include `ts` in the PK so hypertable creation works.

- [ ] **Step 2: Implement `db.py`**

```python
# src/insights/db.py
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from .config import get_settings

_engine = None
_sessionmaker = None


def get_engine():
    global _engine
    if _engine is None:
        _engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
    return _engine


def get_sessionmaker():
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(get_engine(), expire_on_commit=False, class_=AsyncSession)
    return _sessionmaker


@asynccontextmanager
async def session_scope() -> AsyncIterator[AsyncSession]:
    sm = get_sessionmaker()
    async with sm() as s:
        try:
            yield s
            await s.commit()
        except Exception:
            await s.rollback()
            raise
```

- [ ] **Step 3: Commit**

```bash
git add insights/src/insights/models.py insights/src/insights/db.py
git commit -m "feat(insights): add ORM models and async session factory"
```

---

## Task 4: Alembic setup + base migration

**Files:**
- Create: `insights/alembic.ini`
- Create: `insights/alembic/env.py`
- Create: `insights/alembic/versions/0001_initial.py`

- [ ] **Step 1: Initialize Alembic**

Run: `cd insights && uv run alembic init alembic`
Then edit generated `alembic.ini` — replace `sqlalchemy.url = …` with `sqlalchemy.url =` (empty; populated in env.py).

- [ ] **Step 2: Overwrite `alembic/env.py`**

```python
# alembic/env.py
import asyncio
from logging.config import fileConfig
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlalchemy import pool
from alembic import context

from insights.config import get_settings
from insights.models import Base

config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection):
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

- [ ] **Step 3: Write initial migration (base tables + Timescale hypertables + continuous aggregates)**

Create `alembic/versions/0001_initial.py`:

```python
"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-04-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")

    op.create_table(
        "events",
        sa.Column("id", sa.BigInteger, autoincrement=True, nullable=False),
        sa.Column("event_id", sa.Text, nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("type", sa.Text, nullable=False),
        sa.Column("payload", postgresql.JSONB, nullable=False),
        sa.PrimaryKeyConstraint("id", "ts"),
        sa.UniqueConstraint("event_id", "ts", name="uq_events_event_id_ts"),
    )
    op.create_index("ix_events_type_ts", "events", ["type", "ts"])
    op.execute("SELECT create_hypertable('events', 'ts', if_not_exists => TRUE)")

    op.create_table(
        "tasks",
        sa.Column("id", sa.Text, primary_key=True),
        sa.Column("status", sa.Text, nullable=False),
        sa.Column("category", sa.Text),
        sa.Column("assigned_agent", sa.Text),
        sa.Column("routing_reason", sa.Text),
        sa.Column("latency_ms", sa.Integer),
        sa.Column("cost", sa.Numeric(14, 6)),
        sa.Column("workflow_id", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_tasks_created_at", "tasks", ["created_at"])
    op.create_index("ix_tasks_agent", "tasks", ["assigned_agent"])
    op.create_index("ix_tasks_status", "tasks", ["status"])

    op.create_table(
        "agent_status_history",
        sa.Column("id", sa.BigInteger, autoincrement=True, nullable=False),
        sa.Column("agent", sa.Text, nullable=False),
        sa.Column("ts", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.Text, nullable=False),
        sa.PrimaryKeyConstraint("id", "ts"),
    )
    op.execute(
        "SELECT create_hypertable('agent_status_history', 'ts', if_not_exists => TRUE)"
    )

    # Continuous aggregate: tasks_by_minute
    op.execute("""
        CREATE MATERIALIZED VIEW tasks_by_minute
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 minute', created_at) AS minute,
            status,
            assigned_agent,
            count(*) AS count,
            avg(latency_ms)::int AS avg_latency_ms,
            coalesce(sum(cost), 0)::numeric AS sum_cost
        FROM tasks
        GROUP BY minute, status, assigned_agent
        WITH NO DATA
    """)
    op.execute("""
        SELECT add_continuous_aggregate_policy('tasks_by_minute',
            start_offset => INTERVAL '7 days',
            end_offset => INTERVAL '1 minute',
            schedule_interval => INTERVAL '1 minute')
    """)

    # Continuous aggregate: agent_latency_1m
    op.execute("""
        CREATE MATERIALIZED VIEW agent_latency_1m
        WITH (timescaledb.continuous) AS
        SELECT
            time_bucket('1 minute', created_at) AS minute,
            assigned_agent AS agent,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) AS p50_latency,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) AS p95_latency,
            count(*) AS count
        FROM tasks
        WHERE latency_ms IS NOT NULL AND assigned_agent IS NOT NULL
        GROUP BY minute, assigned_agent
        WITH NO DATA
    """)
    op.execute("""
        SELECT add_continuous_aggregate_policy('agent_latency_1m',
            start_offset => INTERVAL '7 days',
            end_offset => INTERVAL '1 minute',
            schedule_interval => INTERVAL '1 minute')
    """)


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS agent_latency_1m CASCADE")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS tasks_by_minute CASCADE")
    op.drop_table("agent_status_history")
    op.drop_table("tasks")
    op.drop_table("events")
```

Note: `percentile_cont` in continuous aggregates requires Timescale 2.7+. If Timescale complains about non-parallelizable aggregates, fall back to plain `MATERIALIZED VIEW` without `timescaledb.continuous` for `agent_latency_1m` — the integration test (Task 5) will catch this.

- [ ] **Step 4: Commit**

```bash
git add insights/alembic.ini insights/alembic/env.py insights/alembic/versions/0001_initial.py insights/alembic/README insights/alembic/script.py.mako
git commit -m "feat(insights): alembic setup with initial Timescale schema"
```

---

## Task 5: Integration test — migrations run on real Postgres

**Files:**
- Create: `insights/tests/conftest.py`
- Create: `insights/tests/integration/__init__.py`
- Create: `insights/tests/integration/test_migrations.py`

- [ ] **Step 1: Create `conftest.py` with Postgres+Timescale container fixture**

```python
# tests/conftest.py
import os
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
async def migrated_engine(database_url):
    # Run Alembic migrations against the test DB
    from alembic import command
    from alembic.config import Config
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", database_url)
    command.upgrade(cfg, "head")

    engine = create_async_engine(database_url)
    yield engine
    await engine.dispose()


@pytest.fixture(autouse=True)
async def clean_tables(migrated_engine):
    """Truncate tables between tests to keep them isolated."""
    async with migrated_engine.begin() as conn:
        await conn.execute(text("TRUNCATE events, tasks, agent_status_history RESTART IDENTITY"))
    yield
```

- [ ] **Step 2: Write migration smoke test**

```python
# tests/integration/test_migrations.py
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
```

- [ ] **Step 3: Run integration tests**

Run: `cd insights && uv run pytest tests/integration/test_migrations.py -v`
Expected: PASS. (Docker must be running; testcontainers pulls the Timescale image on first run.)

If `agent_latency_1m` failed to create during migration, edit Task 4's migration to drop the `WITH (timescaledb.continuous)` clause for that view and use a plain materialized view refreshed manually. Re-run.

- [ ] **Step 4: Commit**

```bash
git add insights/tests/conftest.py insights/tests/integration/test_migrations.py insights/tests/integration/__init__.py insights/tests/__init__.py insights/tests/unit/__init__.py
git commit -m "test(insights): integration fixture + migration smoke test"
```

---

## Task 6: Time utilities

**Files:**
- Create: `insights/src/insights/time_utils.py`
- Create: `insights/tests/unit/test_time_utils.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/unit/test_time_utils.py
from datetime import timedelta
import pytest
from insights.time_utils import parse_range, parse_bucket


@pytest.mark.parametrize("s,expected", [
    ("1h", timedelta(hours=1)),
    ("24h", timedelta(hours=24)),
    ("7d", timedelta(days=7)),
    ("15m", timedelta(minutes=15)),
])
def test_parse_range(s, expected):
    assert parse_range(s) == expected


def test_parse_range_invalid():
    with pytest.raises(ValueError):
        parse_range("banana")


@pytest.mark.parametrize("s,expected", [
    ("1m", timedelta(minutes=1)),
    ("5m", timedelta(minutes=5)),
    ("1h", timedelta(hours=1)),
])
def test_parse_bucket(s, expected):
    assert parse_bucket(s) == expected
```

- [ ] **Step 2: Run and verify failure**

Run: `uv run pytest tests/unit/test_time_utils.py -v`
Expected: ImportError.

- [ ] **Step 3: Implement**

```python
# src/insights/time_utils.py
import re
from datetime import timedelta

_PATTERN = re.compile(r"^(\d+)([smhd])$")
_UNITS = {"s": "seconds", "m": "minutes", "h": "hours", "d": "days"}


def _parse(s: str) -> timedelta:
    m = _PATTERN.match(s)
    if not m:
        raise ValueError(f"invalid duration: {s!r}")
    n, unit = int(m.group(1)), m.group(2)
    return timedelta(**{_UNITS[unit]: n})


def parse_range(s: str) -> timedelta:
    return _parse(s)


def parse_bucket(s: str) -> timedelta:
    return _parse(s)
```

- [ ] **Step 4: Run tests — PASS**

Run: `uv run pytest tests/unit/test_time_utils.py -v`

- [ ] **Step 5: Commit**

```bash
git add insights/src/insights/time_utils.py insights/tests/unit/test_time_utils.py
git commit -m "feat(insights): add time range/bucket parsing utilities"
```

---

## Task 7: Event handlers (event payload → rows)

**Context:** Relay emits SSE events with `data: {...}` payloads. The event types (from `CLAUDE.md`):

```
task:created, task:routed, task:progress, task:completed, task:failed,
task:canceled, task:input-required, agent:registered, agent:deregistered,
agent:status, workflow:started, workflow:step, workflow:completed,
message:sent, message:received
```

Each payload is JSON. We treat each as a dict and extract what we need. The handler's job is: given (event_id, ts, type, payload), compute SQL writes.

**Files:**
- Create: `insights/src/insights/ingestion/__init__.py`
- Create: `insights/src/insights/ingestion/handlers.py`
- Create: `insights/tests/unit/test_handlers.py`

- [ ] **Step 1: Write failing tests**

```python
# tests/unit/test_handlers.py
import pytest
from datetime import datetime, timezone
from insights.ingestion.handlers import handle_event, EventAction


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def test_task_created_upserts_task_and_logs_event():
    actions = handle_event(
        event_id="42",
        ts=_dt("2026-04-15T10:00:00"),
        type_="task:created",
        payload={"id": "t1", "status": "submitted", "createdAt": "2026-04-15T10:00:00Z"},
    )
    kinds = [a.kind for a in actions]
    assert "event_insert" in kinds
    assert "task_upsert" in kinds
    task = next(a for a in actions if a.kind == "task_upsert")
    assert task.data["id"] == "t1"
    assert task.data["status"] == "submitted"


def test_task_routed_updates_agent_and_category():
    actions = handle_event(
        event_id="43",
        ts=_dt("2026-04-15T10:00:01"),
        type_="task:routed",
        payload={"id": "t1", "agent": "claude-code", "category": "coding", "reason": "best fit"},
    )
    update = next(a for a in actions if a.kind == "task_update")
    assert update.data["assigned_agent"] == "claude-code"
    assert update.data["category"] == "coding"
    assert update.data["routing_reason"] == "best fit"


def test_task_completed_sets_latency_and_completed_at():
    actions = handle_event(
        event_id="44",
        ts=_dt("2026-04-15T10:00:05"),
        type_="task:completed",
        payload={"id": "t1", "latencyMs": 4000, "cost": 0.012},
    )
    update = next(a for a in actions if a.kind == "task_update")
    assert update.data["status"] == "completed"
    assert update.data["latency_ms"] == 4000
    assert update.data["cost"] == 0.012
    assert update.data["completed_at"] == _dt("2026-04-15T10:00:05")


def test_agent_status_appends_history():
    actions = handle_event(
        event_id="45",
        ts=_dt("2026-04-15T10:01:00"),
        type_="agent:status",
        payload={"name": "codex", "status": "offline"},
    )
    hist = next(a for a in actions if a.kind == "agent_status_insert")
    assert hist.data == {"agent": "codex", "status": "offline", "ts": _dt("2026-04-15T10:01:00")}


def test_unknown_event_only_logs():
    actions = handle_event(
        event_id="99",
        ts=_dt("2026-04-15T10:02:00"),
        type_="workflow:step",
        payload={"foo": "bar"},
    )
    kinds = [a.kind for a in actions]
    assert kinds == ["event_insert"]
```

- [ ] **Step 2: Run — FAIL**

Run: `uv run pytest tests/unit/test_handlers.py -v`

- [ ] **Step 3: Implement handlers**

```python
# src/insights/ingestion/handlers.py
from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from dateutil import parser as dtparser


@dataclass
class EventAction:
    kind: str            # event_insert | task_upsert | task_update | agent_status_insert
    data: dict[str, Any]


def _parse_ts(value: str | None, default: datetime) -> datetime:
    if not value:
        return default
    dt = dtparser.isoparse(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def handle_event(
    *, event_id: str, ts: datetime, type_: str, payload: dict[str, Any]
) -> list[EventAction]:
    actions: list[EventAction] = [
        EventAction("event_insert", {
            "event_id": event_id, "ts": ts, "type": type_, "payload": payload,
        })
    ]

    if type_ == "task:created":
        actions.append(EventAction("task_upsert", {
            "id": payload["id"],
            "status": payload.get("status", "submitted"),
            "created_at": _parse_ts(payload.get("createdAt"), ts),
            "category": payload.get("category"),
            "assigned_agent": payload.get("agent"),
        }))
    elif type_ == "task:routed":
        actions.append(EventAction("task_update", {
            "id": payload["id"],
            "assigned_agent": payload.get("agent"),
            "category": payload.get("category"),
            "routing_reason": payload.get("reason"),
        }))
    elif type_ == "task:progress":
        actions.append(EventAction("task_update", {
            "id": payload["id"],
            "status": payload.get("status", "working"),
        }))
    elif type_ == "task:completed":
        actions.append(EventAction("task_update", {
            "id": payload["id"],
            "status": "completed",
            "latency_ms": payload.get("latencyMs"),
            "cost": payload.get("cost"),
            "completed_at": ts,
        }))
    elif type_ in ("task:failed", "task:canceled"):
        actions.append(EventAction("task_update", {
            "id": payload["id"],
            "status": type_.split(":", 1)[1],  # "failed" | "canceled"
            "completed_at": ts,
        }))
    elif type_ == "task:input-required":
        actions.append(EventAction("task_update", {
            "id": payload["id"],
            "status": "input-required",
        }))
    elif type_ in ("agent:registered", "agent:deregistered", "agent:status"):
        status = payload.get("status")
        if type_ == "agent:registered":
            status = status or "online"
        elif type_ == "agent:deregistered":
            status = status or "offline"
        actions.append(EventAction("agent_status_insert", {
            "agent": payload.get("name") or payload.get("agent"),
            "ts": ts,
            "status": status or "unknown",
        }))
    # workflow:* and message:* are logged only

    return actions
```

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add insights/src/insights/ingestion/__init__.py insights/src/insights/ingestion/handlers.py insights/tests/unit/test_handlers.py
git commit -m "feat(insights): translate relay events into DB actions"
```

---

## Task 8: SSE client

**Context:** The relay's SSE format is `id: N\ndata: {...}\n\n` (see `packages/relay/src/sse.ts`). We need an async iterator that yields `(event_id, data_dict)` tuples and reconnects with `Last-Event-ID`.

**Files:**
- Create: `insights/src/insights/ingestion/sse_client.py`
- Create: `insights/tests/unit/test_sse_parser.py`

- [ ] **Step 1: Write failing test for parser**

```python
# tests/unit/test_sse_parser.py
from insights.ingestion.sse_client import parse_sse_lines


def test_parses_single_event():
    lines = ["id: 7", "data: {\"foo\":\"bar\"}", ""]
    events = list(parse_sse_lines(iter(lines)))
    assert events == [("7", '{"foo":"bar"}')]


def test_parses_multiple_events():
    lines = [
        "id: 1", 'data: {"a":1}', "",
        "id: 2", 'data: {"b":2}', "",
    ]
    events = list(parse_sse_lines(iter(lines)))
    assert events == [("1", '{"a":1}'), ("2", '{"b":2}')]


def test_ignores_comments_and_blank_prefix():
    lines = [": keepalive", "id: 3", 'data: {"x":1}', ""]
    events = list(parse_sse_lines(iter(lines)))
    assert events == [("3", '{"x":1}')]
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement SSE parser + async client**

```python
# src/insights/ingestion/sse_client.py
from __future__ import annotations
import asyncio
import json
import logging
from collections.abc import AsyncIterator, Iterable, Iterator
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import httpx

log = logging.getLogger(__name__)


@dataclass
class SSEEvent:
    event_id: str
    received_at: datetime
    data: dict[str, Any]


def parse_sse_lines(lines: Iterable[str]) -> Iterator[tuple[str, str]]:
    """Sync parser. Yields (event_id, data_string) once a blank line terminates a block."""
    event_id: str | None = None
    data_parts: list[str] = []
    for raw in lines:
        line = raw.rstrip("\r")
        if line == "":
            if event_id is not None and data_parts:
                yield event_id, "\n".join(data_parts)
            event_id = None
            data_parts = []
            continue
        if line.startswith(":"):
            continue  # comment/keepalive
        if line.startswith("id:"):
            event_id = line[3:].strip()
        elif line.startswith("data:"):
            data_parts.append(line[5:].lstrip())


async def stream_events(
    url: str,
    *,
    last_event_id: str | None = None,
    reconnect_max: float = 30.0,
) -> AsyncIterator[SSEEvent]:
    """Long-lived SSE stream with reconnect. Yields parsed events indefinitely."""
    backoff = 1.0
    current_last_id = last_event_id
    while True:
        headers = {"Accept": "text/event-stream"}
        if current_last_id is not None:
            headers["Last-Event-ID"] = current_last_id
        try:
            async with httpx.AsyncClient(timeout=None) as client:
                async with client.stream("GET", url, headers=headers) as resp:
                    resp.raise_for_status()
                    log.info("SSE connected to %s (last_event_id=%s)", url, current_last_id)
                    backoff = 1.0
                    event_id: str | None = None
                    data_parts: list[str] = []
                    async for line in resp.aiter_lines():
                        if line == "":
                            if event_id is not None and data_parts:
                                raw = "\n".join(data_parts)
                                try:
                                    data = json.loads(raw)
                                except json.JSONDecodeError:
                                    log.warning("bad JSON in SSE event %s", event_id)
                                    event_id, data_parts = None, []
                                    continue
                                yield SSEEvent(
                                    event_id=event_id,
                                    received_at=datetime.now(timezone.utc),
                                    data=data,
                                )
                                current_last_id = event_id
                            event_id, data_parts = None, []
                            continue
                        if line.startswith(":"):
                            continue
                        if line.startswith("id:"):
                            event_id = line[3:].strip()
                        elif line.startswith("data:"):
                            data_parts.append(line[5:].lstrip())
        except (httpx.HTTPError, asyncio.CancelledError) as e:
            if isinstance(e, asyncio.CancelledError):
                raise
            log.warning("SSE stream error: %s; reconnecting in %.1fs", e, backoff)
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, reconnect_max)
```

- [ ] **Step 4: Run parser unit tests — PASS**

Run: `uv run pytest tests/unit/test_sse_parser.py -v`

- [ ] **Step 5: Commit**

```bash
git add insights/src/insights/ingestion/sse_client.py insights/tests/unit/test_sse_parser.py
git commit -m "feat(insights): async SSE client with reconnect and Last-Event-ID"
```

---

## Task 9: Write-path helper that applies EventActions

**Files:**
- Create: `insights/src/insights/ingestion/writer.py`
- Create: `insights/tests/integration/test_writer.py`

- [ ] **Step 1: Implement writer**

```python
# src/insights/ingestion/writer.py
from __future__ import annotations
from collections.abc import Iterable
from sqlalchemy import text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models
from .handlers import EventAction


async def apply_actions(session: AsyncSession, actions: Iterable[EventAction]) -> None:
    for a in actions:
        if a.kind == "event_insert":
            stmt = insert(models.Event).values(**a.data).on_conflict_do_nothing(
                index_elements=["event_id", "ts"]
            )
            await session.execute(stmt)
        elif a.kind == "task_upsert":
            data = {k: v for k, v in a.data.items() if v is not None}
            data.setdefault("status", "submitted")
            stmt = insert(models.Task).values(**data)
            update_cols = {c: stmt.excluded[c] for c in data.keys() if c != "id"}
            if update_cols:
                stmt = stmt.on_conflict_do_update(index_elements=["id"], set_=update_cols)
            else:
                stmt = stmt.on_conflict_do_nothing(index_elements=["id"])
            await session.execute(stmt)
        elif a.kind == "task_update":
            task_id = a.data["id"]
            fields = {k: v for k, v in a.data.items() if k != "id" and v is not None}
            if not fields:
                continue
            await session.execute(
                models.Task.__table__.update()
                .where(models.Task.id == task_id)
                .values(**fields)
            )
        elif a.kind == "agent_status_insert":
            await session.execute(insert(models.AgentStatusHistory).values(**a.data))
```

- [ ] **Step 2: Write integration test**

```python
# tests/integration/test_writer.py
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
```

- [ ] **Step 3: Run — PASS**

Run: `uv run pytest tests/integration/test_writer.py -v`

- [ ] **Step 4: Commit**

```bash
git add insights/src/insights/ingestion/writer.py insights/tests/integration/test_writer.py
git commit -m "feat(insights): writer applies event actions with upserts"
```

---

## Task 10: Backfill

**Files:**
- Create: `insights/src/insights/ingestion/backfill.py`
- Create: `insights/tests/integration/test_backfill.py`

Relay endpoints used: `GET /api/tasks`, `GET /api/agents`. See `packages/relay/src/server.ts` for exact response shapes; the fields used here (`id`, `status`, `assigned_agent`/`agent`, `category`, `latency_ms`/`latencyMs`, `cost`, `created_at`/`createdAt`, `completed_at`/`completedAt`) must be verified against the relay's JSON. Treat both camelCase and snake_case keys defensively since the relay mixes them.

- [ ] **Step 1: Implement backfill**

```python
# src/insights/ingestion/backfill.py
from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from dateutil import parser as dtparser
from sqlalchemy.ext.asyncio import AsyncSession

from .handlers import EventAction
from .writer import apply_actions

log = logging.getLogger(__name__)


def _pick(d: dict, *keys, default=None):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def _parse_ts(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = dtparser.isoparse(str(value))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def _task_to_actions(task: dict) -> list[EventAction]:
    created = _parse_ts(_pick(task, "created_at", "createdAt")) or datetime.now(timezone.utc)
    return [EventAction("task_upsert", {
        "id": task["id"],
        "status": task.get("status", "submitted"),
        "category": task.get("category"),
        "assigned_agent": _pick(task, "assigned_agent", "agent"),
        "routing_reason": _pick(task, "routing_reason", "reason"),
        "latency_ms": _pick(task, "latency_ms", "latencyMs"),
        "cost": task.get("cost"),
        "workflow_id": _pick(task, "workflow_id", "workflowId"),
        "created_at": created,
        "completed_at": _parse_ts(_pick(task, "completed_at", "completedAt")),
    })]


def _agent_to_actions(agent: dict) -> list[EventAction]:
    name = _pick(agent, "name") or (agent.get("card") or {}).get("name")
    if not name:
        return []
    return [EventAction("agent_status_insert", {
        "agent": name,
        "ts": datetime.now(timezone.utc),
        "status": agent.get("status", "online"),
    })]


async def backfill(session: AsyncSession, *, relay_url: str) -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            tasks = (await client.get(f"{relay_url}/api/tasks")).json()
        except httpx.HTTPError as e:
            log.warning("backfill: tasks fetch failed: %s", e)
            tasks = []
        try:
            agents = (await client.get(f"{relay_url}/api/agents")).json()
        except httpx.HTTPError as e:
            log.warning("backfill: agents fetch failed: %s", e)
            agents = []

    tasks_list = tasks if isinstance(tasks, list) else tasks.get("tasks", [])
    agents_list = agents if isinstance(agents, list) else agents.get("agents", [])

    for t in tasks_list:
        await apply_actions(session, _task_to_actions(t))
    for a in agents_list:
        await apply_actions(session, _agent_to_actions(a))
    log.info("backfill complete: %d tasks, %d agents", len(tasks_list), len(agents_list))
```

- [ ] **Step 2: Integration test with mock relay (respx)**

Add `respx>=0.21` to dev deps first:

Run: `cd insights && uv add --dev respx`

Then:

```python
# tests/integration/test_backfill.py
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
```

- [ ] **Step 3: Run — PASS**

Run: `uv run pytest tests/integration/test_backfill.py -v`

- [ ] **Step 4: Commit**

```bash
git add insights/src/insights/ingestion/backfill.py insights/tests/integration/test_backfill.py insights/pyproject.toml insights/uv.lock
git commit -m "feat(insights): startup REST backfill of tasks and agents"
```

---

## Task 11: Ingestion orchestrator

**Files:**
- Create: `insights/src/insights/ingestion/orchestrator.py`

- [ ] **Step 1: Implement**

```python
# src/insights/ingestion/orchestrator.py
from __future__ import annotations
import asyncio
import logging
from contextlib import asynccontextmanager

from sqlalchemy import select, desc

from ..config import get_settings
from ..db import session_scope, get_sessionmaker
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
```

- [ ] **Step 2: Commit**

```bash
git add insights/src/insights/ingestion/orchestrator.py
git commit -m "feat(insights): backfill + SSE lifespan orchestrator"
```

---

## Task 12: Pydantic response schemas

**Files:**
- Create: `insights/src/insights/schemas.py`

- [ ] **Step 1: Implement**

```python
# src/insights/schemas.py
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    db: str
    ingestor_lag_seconds: float | None = None


class OverviewResponse(BaseModel):
    range: str
    throughput: int
    success_rate: float
    p50_latency_ms: float | None
    p95_latency_ms: float | None
    total_cost: Decimal
    failed_count: int


class AgentSummary(BaseModel):
    agent: str
    task_count: int
    success_rate: float
    p50_latency_ms: float | None
    p95_latency_ms: float | None
    total_cost: Decimal


class AgentsResponse(BaseModel):
    agents: list[AgentSummary]


class TimeseriesPoint(BaseModel):
    ts: datetime
    value: float | None


class TimeseriesResponse(BaseModel):
    metric: str
    bucket: str
    range: str
    points: list[TimeseriesPoint]


class RoutingCategory(BaseModel):
    category: str
    agent: str
    successes: int
    failures: int
    success_rate: float


class RoutingEffectivenessResponse(BaseModel):
    categories: list[RoutingCategory]


class CostRow(BaseModel):
    key: str
    cost: Decimal


class CostBreakdownResponse(BaseModel):
    group_by: str
    range: str
    rows: list[CostRow]
```

- [ ] **Step 2: Commit**

```bash
git add insights/src/insights/schemas.py
git commit -m "feat(insights): Pydantic response schemas"
```

---

## Task 13: Analytics — overview

**Files:**
- Create: `insights/src/insights/analytics/__init__.py`
- Create: `insights/src/insights/analytics/overview.py`
- Create: `insights/tests/integration/test_analytics_overview.py`

- [ ] **Step 1: Write failing integration test**

```python
# tests/integration/test_analytics_overview.py
import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import text

from insights.db import get_sessionmaker
from insights.analytics.overview import compute_overview


@pytest.mark.asyncio
async def test_overview_reflects_seeded_tasks(migrated_engine):
    now = datetime.now(timezone.utc)
    async with migrated_engine.begin() as conn:
        # Seed 4 tasks: 3 completed, 1 failed
        await conn.execute(text("""
            INSERT INTO tasks (id, status, latency_ms, cost, created_at, completed_at)
            VALUES
              ('a', 'completed', 100, 0.01, :t, :t),
              ('b', 'completed', 200, 0.02, :t, :t),
              ('c', 'completed', 300, 0.03, :t, :t),
              ('d', 'failed',    500, 0.05, :t, :t)
        """), {"t": now - timedelta(minutes=5)})

    sm = get_sessionmaker()
    async with sm() as s:
        ov = await compute_overview(s, range_=timedelta(hours=1))

    assert ov["throughput"] == 4
    assert ov["failed_count"] == 1
    assert ov["success_rate"] == 0.75
    assert 100 <= (ov["p50_latency_ms"] or 0) <= 300
    assert float(ov["total_cost"]) == pytest.approx(0.11)
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```python
# src/insights/analytics/overview.py
from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def compute_overview(session: AsyncSession, *, range_: timedelta) -> dict:
    since = datetime.now(timezone.utc) - range_
    stmt = text("""
        SELECT
            count(*) AS total,
            count(*) FILTER (WHERE status = 'completed') AS completed,
            count(*) FILTER (WHERE status IN ('failed','canceled')) AS failed,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS p50,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS p95,
            coalesce(sum(cost), 0) AS total_cost
        FROM tasks
        WHERE created_at >= :since
    """)
    row = (await session.execute(stmt, {"since": since})).one()
    total = row.total or 0
    completed = row.completed or 0
    return {
        "throughput": total,
        "failed_count": row.failed or 0,
        "success_rate": (completed / total) if total else 0.0,
        "p50_latency_ms": float(row.p50) if row.p50 is not None else None,
        "p95_latency_ms": float(row.p95) if row.p95 is not None else None,
        "total_cost": row.total_cost,
    }
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add insights/src/insights/analytics/__init__.py insights/src/insights/analytics/overview.py insights/tests/integration/test_analytics_overview.py
git commit -m "feat(insights): overview analytics query"
```

---

## Task 14: Analytics — agents summary

**Files:**
- Create: `insights/src/insights/analytics/agents.py`
- Create: `insights/tests/integration/test_analytics_agents.py`

- [ ] **Step 1: Write failing integration test**

```python
# tests/integration/test_analytics_agents.py
import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import text

from insights.db import get_sessionmaker
from insights.analytics.agents import summarize_agents


@pytest.mark.asyncio
async def test_agent_summary(migrated_engine):
    now = datetime.now(timezone.utc) - timedelta(minutes=10)
    async with migrated_engine.begin() as conn:
        await conn.execute(text("""
            INSERT INTO tasks (id, status, assigned_agent, latency_ms, cost, created_at, completed_at)
            VALUES
              ('x','completed','codex',100,0.01,:t,:t),
              ('y','completed','codex',300,0.02,:t,:t),
              ('z','failed','codex',400,0.03,:t,:t),
              ('w','completed','claude-code',150,0.05,:t,:t)
        """), {"t": now})

    sm = get_sessionmaker()
    async with sm() as s:
        rows = await summarize_agents(s, range_=timedelta(hours=1))

    by_agent = {r["agent"]: r for r in rows}
    assert by_agent["codex"]["task_count"] == 3
    assert by_agent["codex"]["success_rate"] == pytest.approx(2/3)
    assert by_agent["claude-code"]["task_count"] == 1
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```python
# src/insights/analytics/agents.py
from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def summarize_agents(session: AsyncSession, *, range_: timedelta) -> list[dict]:
    since = datetime.now(timezone.utc) - range_
    stmt = text("""
        SELECT
            assigned_agent AS agent,
            count(*) AS task_count,
            count(*) FILTER (WHERE status = 'completed') AS completed,
            percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS p50,
            percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms) FILTER (WHERE latency_ms IS NOT NULL) AS p95,
            coalesce(sum(cost), 0) AS total_cost
        FROM tasks
        WHERE created_at >= :since AND assigned_agent IS NOT NULL
        GROUP BY assigned_agent
        ORDER BY task_count DESC
    """)
    rows = (await session.execute(stmt, {"since": since})).all()
    return [
        {
            "agent": r.agent,
            "task_count": r.task_count,
            "success_rate": (r.completed / r.task_count) if r.task_count else 0.0,
            "p50_latency_ms": float(r.p50) if r.p50 is not None else None,
            "p95_latency_ms": float(r.p95) if r.p95 is not None else None,
            "total_cost": r.total_cost,
        }
        for r in rows
    ]
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add insights/src/insights/analytics/agents.py insights/tests/integration/test_analytics_agents.py
git commit -m "feat(insights): per-agent performance summary"
```

---

## Task 15: Analytics — timeseries + routing + cost

**Files:**
- Create: `insights/src/insights/analytics/timeseries.py`
- Create: `insights/src/insights/analytics/routing.py`
- Create: `insights/src/insights/analytics/cost.py`
- Create: `insights/tests/integration/test_analytics_misc.py`

- [ ] **Step 1: Implement timeseries**

```python
# src/insights/analytics/timeseries.py
from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ALLOWED_METRICS = {"throughput", "latency_p50", "latency_p95", "success_rate", "cost"}

# Map metric → SQL expression computed per bucket
_METRIC_SQL = {
    "throughput": "count(*)::float",
    "latency_p50": "percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float",
    "latency_p95": "percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float",
    "success_rate": "(count(*) FILTER (WHERE status = 'completed'))::float / NULLIF(count(*),0)",
    "cost": "coalesce(sum(cost),0)::float",
}


async def compute_timeseries(
    session: AsyncSession,
    *,
    metric: str,
    range_: timedelta,
    bucket: timedelta,
    agent: str | None = None,
) -> list[dict]:
    if metric not in ALLOWED_METRICS:
        raise ValueError(f"unknown metric: {metric}")
    since = datetime.now(timezone.utc) - range_
    where = "created_at >= :since"
    params = {"since": since, "bucket": f"{int(bucket.total_seconds())} seconds"}
    if agent is not None:
        where += " AND assigned_agent = :agent"
        params["agent"] = agent

    sql = f"""
        SELECT time_bucket(:bucket::interval, created_at) AS ts,
               {_METRIC_SQL[metric]} AS value
        FROM tasks
        WHERE {where}
        GROUP BY ts
        ORDER BY ts
    """
    rows = (await session.execute(text(sql), params)).all()
    return [{"ts": r.ts, "value": r.value} for r in rows]
```

- [ ] **Step 2: Implement routing**

```python
# src/insights/analytics/routing.py
from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def compute_routing_effectiveness(
    session: AsyncSession, *, range_: timedelta
) -> list[dict]:
    since = datetime.now(timezone.utc) - range_
    stmt = text("""
        SELECT
            coalesce(category, 'uncategorized') AS category,
            assigned_agent AS agent,
            count(*) FILTER (WHERE status = 'completed') AS successes,
            count(*) FILTER (WHERE status IN ('failed','canceled')) AS failures,
            count(*) AS total
        FROM tasks
        WHERE created_at >= :since AND assigned_agent IS NOT NULL
        GROUP BY category, assigned_agent
        ORDER BY category, total DESC
    """)
    rows = (await session.execute(stmt, {"since": since})).all()
    return [
        {
            "category": r.category,
            "agent": r.agent,
            "successes": r.successes,
            "failures": r.failures,
            "success_rate": (r.successes / r.total) if r.total else 0.0,
        }
        for r in rows
    ]
```

- [ ] **Step 3: Implement cost**

```python
# src/insights/analytics/cost.py
from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_GROUP_COLS = {
    "agent": "coalesce(assigned_agent, 'unassigned')",
    "status": "status",
    "category": "coalesce(category, 'uncategorized')",
}


async def compute_cost_breakdown(
    session: AsyncSession, *, group_by: str, range_: timedelta
) -> list[dict]:
    if group_by not in _GROUP_COLS:
        raise ValueError(f"invalid groupBy: {group_by}")
    since = datetime.now(timezone.utc) - range_
    col = _GROUP_COLS[group_by]
    sql = f"""
        SELECT {col} AS key, coalesce(sum(cost), 0) AS cost
        FROM tasks
        WHERE created_at >= :since
        GROUP BY key
        ORDER BY cost DESC
    """
    rows = (await session.execute(text(sql), {"since": since})).all()
    return [{"key": r.key, "cost": r.cost} for r in rows]
```

- [ ] **Step 4: Integration test**

```python
# tests/integration/test_analytics_misc.py
import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import text

from insights.db import get_sessionmaker
from insights.analytics.timeseries import compute_timeseries
from insights.analytics.routing import compute_routing_effectiveness
from insights.analytics.cost import compute_cost_breakdown


async def _seed(engine):
    now = datetime.now(timezone.utc) - timedelta(minutes=5)
    async with engine.begin() as conn:
        await conn.execute(text("""
            INSERT INTO tasks (id,status,category,assigned_agent,latency_ms,cost,created_at,completed_at)
            VALUES
              ('1','completed','coding','codex',100,0.01,:t,:t),
              ('2','completed','coding','codex',200,0.02,:t,:t),
              ('3','failed','coding','codex',500,0.03,:t,:t),
              ('4','completed','support','claude-code',100,0.04,:t,:t)
        """), {"t": now})


@pytest.mark.asyncio
async def test_timeseries_throughput(migrated_engine):
    await _seed(migrated_engine)
    async with get_sessionmaker()() as s:
        points = await compute_timeseries(
            s, metric="throughput", range_=timedelta(hours=1), bucket=timedelta(minutes=1)
        )
    assert sum(p["value"] for p in points) == 4


@pytest.mark.asyncio
async def test_routing_effectiveness(migrated_engine):
    await _seed(migrated_engine)
    async with get_sessionmaker()() as s:
        rows = await compute_routing_effectiveness(s, range_=timedelta(hours=1))
    coding = next(r for r in rows if r["category"] == "coding")
    assert coding["successes"] == 2
    assert coding["failures"] == 1


@pytest.mark.asyncio
async def test_cost_by_agent(migrated_engine):
    await _seed(migrated_engine)
    async with get_sessionmaker()() as s:
        rows = await compute_cost_breakdown(s, group_by="agent", range_=timedelta(hours=1))
    by_agent = {r["key"]: float(r["cost"]) for r in rows}
    assert by_agent["codex"] == pytest.approx(0.06)
    assert by_agent["claude-code"] == pytest.approx(0.04)
```

- [ ] **Step 5: Run — PASS**

- [ ] **Step 6: Commit**

```bash
git add insights/src/insights/analytics/timeseries.py insights/src/insights/analytics/routing.py insights/src/insights/analytics/cost.py insights/tests/integration/test_analytics_misc.py
git commit -m "feat(insights): timeseries, routing effectiveness, cost breakdown"
```

---

## Task 16: API routers

**Files:**
- Create: `insights/src/insights/api/__init__.py`
- Create: `insights/src/insights/api/routers/__init__.py`
- Create: `insights/src/insights/api/routers/health.py`
- Create: `insights/src/insights/api/routers/overview.py`
- Create: `insights/src/insights/api/routers/agents.py`
- Create: `insights/src/insights/api/routers/routing.py`
- Create: `insights/src/insights/api/routers/timeseries.py`
- Create: `insights/src/insights/api/routers/cost.py`

- [ ] **Step 1: Implement health**

```python
# src/insights/api/routers/health.py
from fastapi import APIRouter
from sqlalchemy import text
from ...db import session_scope
from ...schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health():
    try:
        async with session_scope() as s:
            await s.execute(text("SELECT 1"))
        db = "ok"
    except Exception:
        db = "error"
    return HealthResponse(status="ok", db=db)
```

- [ ] **Step 2: Implement overview**

```python
# src/insights/api/routers/overview.py
from fastapi import APIRouter
from ...db import session_scope
from ...schemas import OverviewResponse
from ...analytics.overview import compute_overview
from ...time_utils import parse_range

router = APIRouter()


@router.get("/overview", response_model=OverviewResponse)
async def overview(range: str = "24h"):
    td = parse_range(range)
    async with session_scope() as s:
        data = await compute_overview(s, range_=td)
    return OverviewResponse(range=range, **data)
```

- [ ] **Step 3: Implement agents**

```python
# src/insights/api/routers/agents.py
from fastapi import APIRouter
from ...db import session_scope
from ...schemas import AgentSummary, AgentsResponse, TimeseriesResponse, TimeseriesPoint
from ...analytics.agents import summarize_agents
from ...analytics.timeseries import compute_timeseries, ALLOWED_METRICS
from ...time_utils import parse_range, parse_bucket
from fastapi import HTTPException

router = APIRouter()


@router.get("/agents", response_model=AgentsResponse)
async def list_agents(range: str = "24h"):
    td = parse_range(range)
    async with session_scope() as s:
        rows = await summarize_agents(s, range_=td)
    return AgentsResponse(agents=[AgentSummary(**r) for r in rows])


@router.get("/agents/{name}/timeseries", response_model=TimeseriesResponse)
async def agent_timeseries(
    name: str, metric: str = "throughput", range: str = "24h", bucket: str = "5m"
):
    if metric not in ALLOWED_METRICS:
        raise HTTPException(400, f"unknown metric '{metric}'")
    async with session_scope() as s:
        pts = await compute_timeseries(
            s, metric=metric, range_=parse_range(range),
            bucket=parse_bucket(bucket), agent=name,
        )
    return TimeseriesResponse(
        metric=metric, bucket=bucket, range=range,
        points=[TimeseriesPoint(**p) for p in pts],
    )
```

- [ ] **Step 4: Implement routing router**

```python
# src/insights/api/routers/routing.py
from fastapi import APIRouter
from ...db import session_scope
from ...schemas import RoutingEffectivenessResponse, RoutingCategory
from ...analytics.routing import compute_routing_effectiveness
from ...time_utils import parse_range

router = APIRouter()


@router.get("/routing/effectiveness", response_model=RoutingEffectivenessResponse)
async def routing_effectiveness(range: str = "24h"):
    async with session_scope() as s:
        rows = await compute_routing_effectiveness(s, range_=parse_range(range))
    return RoutingEffectivenessResponse(
        categories=[RoutingCategory(**r) for r in rows]
    )
```

- [ ] **Step 5: Implement timeseries + cost routers**

```python
# src/insights/api/routers/timeseries.py
from fastapi import APIRouter, HTTPException
from ...db import session_scope
from ...schemas import TimeseriesResponse, TimeseriesPoint
from ...analytics.timeseries import compute_timeseries, ALLOWED_METRICS
from ...time_utils import parse_range, parse_bucket

router = APIRouter()


@router.get("/tasks/timeseries", response_model=TimeseriesResponse)
async def tasks_timeseries(
    metric: str = "throughput", range: str = "24h", bucket: str = "5m"
):
    if metric not in ALLOWED_METRICS:
        raise HTTPException(400, f"unknown metric '{metric}'")
    async with session_scope() as s:
        pts = await compute_timeseries(
            s, metric=metric, range_=parse_range(range), bucket=parse_bucket(bucket),
        )
    return TimeseriesResponse(
        metric=metric, bucket=bucket, range=range,
        points=[TimeseriesPoint(**p) for p in pts],
    )
```

```python
# src/insights/api/routers/cost.py
from fastapi import APIRouter, HTTPException
from ...db import session_scope
from ...schemas import CostBreakdownResponse, CostRow
from ...analytics.cost import compute_cost_breakdown
from ...time_utils import parse_range

router = APIRouter()


@router.get("/cost/breakdown", response_model=CostBreakdownResponse)
async def cost_breakdown(groupBy: str = "agent", range: str = "24h"):
    try:
        async with session_scope() as s:
            rows = await compute_cost_breakdown(
                s, group_by=groupBy, range_=parse_range(range)
            )
    except ValueError as e:
        raise HTTPException(400, str(e))
    return CostBreakdownResponse(
        group_by=groupBy, range=range, rows=[CostRow(**r) for r in rows]
    )
```

- [ ] **Step 6: Commit**

```bash
git add insights/src/insights/api
git commit -m "feat(insights): FastAPI routers for analytics endpoints"
```

---

## Task 17: FastAPI app + lifespan

**Files:**
- Create: `insights/src/insights/main.py`

- [ ] **Step 1: Implement app**

```python
# src/insights/main.py
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .ingestion.orchestrator import ingestion_lifespan
from .api.routers import health, overview, agents, routing, timeseries, cost


logging.basicConfig(level=get_settings().log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with ingestion_lifespan():
        yield


app = FastAPI(title="Lattice Insights", version="0.1.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

prefix = "/api/v1/insights"
app.include_router(health.router, prefix=prefix, tags=["health"])
app.include_router(overview.router, prefix=prefix, tags=["overview"])
app.include_router(agents.router, prefix=prefix, tags=["agents"])
app.include_router(routing.router, prefix=prefix, tags=["routing"])
app.include_router(timeseries.router, prefix=prefix, tags=["timeseries"])
app.include_router(cost.router, prefix=prefix, tags=["cost"])
```

- [ ] **Step 2: Smoke test — app imports**

Run: `cd insights && uv run python -c "from insights.main import app; print(len(app.routes))"`
Expected: prints a number >= 6.

- [ ] **Step 3: Commit**

```bash
git add insights/src/insights/main.py
git commit -m "feat(insights): FastAPI app with CORS and lifespan-managed ingestion"
```

---

## Task 18: API integration test

**Files:**
- Create: `insights/tests/integration/test_api.py`

- [ ] **Step 1: Write test**

```python
# tests/integration/test_api.py
import pytest
from datetime import datetime, timedelta, timezone
from sqlalchemy import text
from httpx import ASGITransport, AsyncClient

from insights.main import app


@pytest.mark.asyncio
async def test_overview_endpoint(migrated_engine):
    now = datetime.now(timezone.utc) - timedelta(minutes=5)
    async with migrated_engine.begin() as conn:
        await conn.execute(text("""
            INSERT INTO tasks (id,status,latency_ms,cost,created_at,completed_at)
            VALUES
              ('a','completed',100,0.01,:t,:t),
              ('b','completed',200,0.02,:t,:t),
              ('c','failed',500,0.05,:t,:t)
        """), {"t": now})

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Bypass lifespan (which would try to connect to a relay)
        r = await client.get("/api/v1/insights/overview?range=1h")
    assert r.status_code == 200
    body = r.json()
    assert body["throughput"] == 3
    assert body["failed_count"] == 1


@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        r = await client.get("/api/v1/insights/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"
```

Note: `ASGITransport` does not run the lifespan by default, so the SSE ingestor won't start — ideal for this test. If lifespan is needed, wrap with `LifespanManager`.

- [ ] **Step 2: Run — PASS**

Run: `uv run pytest tests/integration/test_api.py -v`

- [ ] **Step 3: Commit**

```bash
git add insights/tests/integration/test_api.py
git commit -m "test(insights): API integration tests via ASGITransport"
```

---

## Task 19: Dockerfile + docker-compose

**Files:**
- Create: `insights/Dockerfile`
- Create: `insights/docker-compose.yml`

- [ ] **Step 1: Dockerfile**

```dockerfile
# insights/Dockerfile
FROM python:3.12-slim
WORKDIR /app

RUN pip install --no-cache-dir uv

COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev

COPY alembic.ini ./
COPY alembic ./alembic
COPY src ./src

ENV PATH="/app/.venv/bin:${PATH}"
ENV PYTHONUNBUFFERED=1
EXPOSE 8000

CMD ["sh", "-c", "alembic upgrade head && uvicorn insights.main:app --host 0.0.0.0 --port 8000"]
```

- [ ] **Step 2: docker-compose.yml**

```yaml
# insights/docker-compose.yml
services:
  postgres:
    image: timescale/timescaledb:latest-pg16
    environment:
      POSTGRES_USER: insights
      POSTGRES_PASSWORD: insights
      POSTGRES_DB: insights
    ports:
      - "5433:5432"
    volumes:
      - insights_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "insights"]
      interval: 5s
      timeout: 3s
      retries: 10

  insights:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      INSIGHTS_DATABASE_URL: postgresql+asyncpg://insights:insights@postgres:5432/insights
      INSIGHTS_RELAY_URL: http://host.docker.internal:3100
      INSIGHTS_CORS_ORIGINS: http://localhost:3200
    ports:
      - "8000:8000"
    extra_hosts:
      - "host.docker.internal:host-gateway"

volumes:
  insights_pgdata:
```

- [ ] **Step 3: Smoke test**

Run: `cd insights && docker compose up -d postgres && sleep 5 && docker compose logs postgres | tail -5`
Expected: Postgres is up, no error.

Then: `docker compose build insights` — verify build succeeds.

- [ ] **Step 4: Commit**

```bash
git add insights/Dockerfile insights/docker-compose.yml
git commit -m "chore(insights): Dockerfile + Compose with Timescale"
```

---

## Task 20: Dashboard — Insights page

**Files:**
- Modify: `packages/dashboard/package.json` (add `recharts`)
- Create: `packages/dashboard/src/lib/insights-api.ts`
- Create: `packages/dashboard/src/pages/insights.tsx`
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add recharts**

Run: `cd packages/dashboard && npm install recharts`

- [ ] **Step 2: API client**

```typescript
// packages/dashboard/src/lib/insights-api.ts
const BASE = import.meta.env.VITE_INSIGHTS_URL ?? "http://localhost:8000";
const PREFIX = `${BASE}/api/v1/insights`;

export interface Overview {
  range: string;
  throughput: number;
  success_rate: number;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  total_cost: string;
  failed_count: number;
}

export interface AgentSummary {
  agent: string;
  task_count: number;
  success_rate: number;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  total_cost: string;
}

export interface TimeseriesPoint {
  ts: string;
  value: number | null;
}

export interface TimeseriesResponse {
  metric: string;
  bucket: string;
  range: string;
  points: TimeseriesPoint[];
}

export interface CostRow { key: string; cost: string }

async function getJSON<T>(path: string): Promise<T> {
  const r = await fetch(`${PREFIX}${path}`);
  if (!r.ok) throw new Error(`${path} ${r.status}`);
  return r.json() as Promise<T>;
}

export const insightsApi = {
  overview: (range = "24h") => getJSON<Overview>(`/overview?range=${range}`),
  agents: (range = "24h") =>
    getJSON<{ agents: AgentSummary[] }>(`/agents?range=${range}`).then((r) => r.agents),
  tasksTimeseries: (metric = "throughput", range = "24h", bucket = "5m") =>
    getJSON<TimeseriesResponse>(
      `/tasks/timeseries?metric=${metric}&range=${range}&bucket=${bucket}`,
    ),
  costBreakdown: (groupBy = "agent", range = "24h") =>
    getJSON<{ group_by: string; range: string; rows: CostRow[] }>(
      `/cost/breakdown?groupBy=${groupBy}&range=${range}`,
    ),
};
```

- [ ] **Step 3: Insights page**

```tsx
// packages/dashboard/src/pages/insights.tsx
import { useEffect, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  BarChart, Bar, CartesianGrid, Legend,
} from "recharts";
import {
  insightsApi,
  type Overview, type AgentSummary, type TimeseriesResponse, type CostRow,
} from "../lib/insights-api";

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-400/10 bg-slate-200/5 px-4 py-3">
      <div className="text-[0.62rem] font-semibold uppercase tracking-[0.26em] text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-100">{value}</div>
    </div>
  );
}

export function InsightsPage() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [agents, setAgents] = useState<AgentSummary[]>([]);
  const [throughput, setThroughput] = useState<TimeseriesResponse | null>(null);
  const [cost, setCost] = useState<CostRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [o, a, t, c] = await Promise.all([
          insightsApi.overview(),
          insightsApi.agents(),
          insightsApi.tasksTimeseries("throughput", "24h", "5m"),
          insightsApi.costBreakdown("agent", "24h"),
        ]);
        setOverview(o); setAgents(a); setThroughput(t); setCost(c.rows); setError(null);
      } catch (e) {
        setError(String(e));
      }
    };
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  if (error) {
    return <div className="p-6 text-rose-300">Insights service unreachable: {error}</div>;
  }
  if (!overview) return <div className="p-6 text-slate-400">Loading analytics…</div>;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-xl font-semibold text-slate-100">Insights</h1>
        <p className="text-sm text-slate-400">Analytics from the Insights service (last 24h).</p>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Throughput" value={String(overview.throughput)} />
        <Tile label="Success rate" value={`${(overview.success_rate * 100).toFixed(1)}%`} />
        <Tile label="p95 latency"
              value={overview.p95_latency_ms ? `${Math.round(overview.p95_latency_ms)}ms` : "—"} />
        <Tile label="Total cost" value={`$${Number(overview.total_cost).toFixed(4)}`} />
      </div>

      <section className="rounded-2xl border border-slate-400/10 bg-slate-200/5 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-200">Throughput (5m buckets)</h2>
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={throughput?.points ?? []}>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
              <XAxis dataKey="ts" tick={{ fill: "#94a3b8", fontSize: 11 }}
                     tickFormatter={(v) => new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
              <Line type="monotone" dataKey="value" stroke="#22d3ee" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-400/10 bg-slate-200/5 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-200">Agent performance</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="py-2">Agent</th><th>Tasks</th><th>Success</th>
              <th>p50</th><th>p95</th><th>Cost</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.agent} className="border-t border-slate-400/10 text-slate-200">
                <td className="py-2">{a.agent}</td>
                <td>{a.task_count}</td>
                <td>{(a.success_rate * 100).toFixed(1)}%</td>
                <td>{a.p50_latency_ms ? `${Math.round(a.p50_latency_ms)}ms` : "—"}</td>
                <td>{a.p95_latency_ms ? `${Math.round(a.p95_latency_ms)}ms` : "—"}</td>
                <td>${Number(a.total_cost).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-slate-400/10 bg-slate-200/5 p-4">
        <h2 className="mb-2 text-sm font-semibold text-slate-200">Cost by agent</h2>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={cost.map((r) => ({ ...r, cost: Number(r.cost) }))}>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
              <XAxis dataKey="key" tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
              <Legend />
              <Bar dataKey="cost" fill="#a78bfa" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 4: Wire route**

Edit `packages/dashboard/src/App.tsx`:

```tsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Shell } from "./components/layout/shell.tsx";
import { AgentOverview } from "./pages/agent-overview.tsx";
import { LiveFlow } from "./pages/live-flow.tsx";
import { TasksPage } from "./pages/tasks-page.tsx";
import { Workflows } from "./pages/workflows.tsx";
import { InsightsPage } from "./pages/insights.tsx";

export function App() {
  return (
    <BrowserRouter>
      <Shell>
        <Routes>
          <Route path="/" element={<AgentOverview />} />
          <Route path="/flow" element={<LiveFlow />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/insights" element={<InsightsPage />} />
        </Routes>
      </Shell>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Add sidebar nav entry**

Edit `packages/dashboard/src/components/layout/sidebar.tsx` — add import and nav item:

```tsx
import { Activity, Layout, ListTodo, GitBranch, BarChart3 } from "lucide-react";
```

In the `navItems` array, append:

```tsx
{ to: "/insights", icon: BarChart3, label: "Insights" },
```

And in the per-item subtitle ternary at the bottom of the NavLink, add an arm for `/insights`:

```tsx
{item.to === "/"
  ? "Roster and dispatch"
  : item.to === "/flow"
    ? "Real-time activity"
    : item.to === "/tasks"
      ? "History and routing"
      : item.to === "/workflows"
        ? "Build and run flows"
        : "Analytics and trends"}
```

- [ ] **Step 6: Manual verification**

Start full stack:

```bash
# Terminal A — Postgres + insights
cd insights && docker compose up -d postgres
uv run alembic upgrade head
uv run uvicorn insights.main:app --port 8000

# Terminal B — relay
cd /Users/basilliu/lattice && npm run dev:relay

# Terminal C — dashboard
npm run dev:dashboard
```

Open `http://localhost:3200/insights` — confirm page loads, tiles render, chart areas visible. Fire a task via the Agents dispatch bar; after it completes, a refresh of Insights should show incremented throughput.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard
git commit -m "feat(dashboard): Insights page consuming Python analytics service"
```

---

## Task 21: End-to-end smoke test

**Files:**
- Create: `insights/tests/e2e/test_smoke.py`

- [ ] **Step 1: Write e2e that exercises ingestion via a mock SSE server**

```python
# tests/e2e/test_smoke.py
import asyncio
import pytest
from datetime import datetime, timezone
import json

from aiohttp import web  # add to dev deps
from sqlalchemy import text

from insights.db import get_sessionmaker
from insights.ingestion.orchestrator import _run_stream


@pytest.mark.asyncio
async def test_stream_ingests_events(migrated_engine, monkeypatch):
    # Minimal SSE server
    async def events(request):
        resp = web.StreamResponse(headers={"Content-Type": "text/event-stream"})
        await resp.prepare(request)
        payload = {"type": "task:created", "payload": {"id": "t-e2e", "status": "submitted", "createdAt": "2026-04-15T10:00:00Z"}}
        await resp.write(f"id: 1\ndata: {json.dumps(payload)}\n\n".encode())
        await asyncio.sleep(0.5)
        return resp

    async def tasks(request): return web.json_response([])
    async def agents(request): return web.json_response([])

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

    task = asyncio.create_task(_run_stream())
    try:
        await asyncio.sleep(1.5)
    finally:
        task.cancel()
        try: await task
        except Exception: pass
        await runner.cleanup()

    async with migrated_engine.connect() as conn:
        row = (await conn.execute(text("SELECT id FROM tasks WHERE id='t-e2e'"))).first()
    assert row is not None
```

Add `aiohttp` as a dev dep first: `uv add --dev aiohttp`.

- [ ] **Step 2: Run — PASS**

- [ ] **Step 3: Commit**

```bash
git add insights/tests/e2e/test_smoke.py insights/pyproject.toml insights/uv.lock
git commit -m "test(insights): e2e smoke — mock SSE server drives real ingestion"
```

---

## Task 22: Root repo integration (demo + docs)

**Files:**
- Modify: `README.md` (brief Insights blurb)
- Modify: `CLAUDE.md` (one line pointer)
- Create: `scripts/insights-up.sh` (convenience)

- [ ] **Step 1: Add convenience script**

```bash
# scripts/insights-up.sh
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../insights"
docker compose up -d postgres
uv run alembic upgrade head
echo "Postgres ready. Start insights with: uv run uvicorn insights.main:app --port 8000"
```

Mark executable: `chmod +x scripts/insights-up.sh`.

- [ ] **Step 2: README blurb**

Add a new section to `README.md` (after existing sections):

```markdown
## Insights (analytics service)

Python/FastAPI service that ingests relay events into TimescaleDB and serves
analytics to the dashboard. See `insights/README.md` for details; the dashboard's
Insights tab consumes it at `http://localhost:8000`.
```

- [ ] **Step 3: One-line pointer in `CLAUDE.md`**

Append to the "Project Structure" section:

```markdown
- `insights/` — standalone Python analytics service (FastAPI + TimescaleDB). Ingests relay SSE events, exposes REST API consumed by dashboard's Insights page.
```

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md scripts/insights-up.sh
git commit -m "docs: document Insights service in root README and CLAUDE.md"
```

---

## Self-Review

**Spec coverage:**
- ✅ Goals/architecture — Tasks 1–19
- ✅ `events`, `tasks`, `agent_status_history` tables + hypertables — Task 4
- ✅ Continuous aggregates — Task 4
- ✅ Startup backfill — Task 10
- ✅ Live SSE stream w/ Last-Event-ID reconnect — Tasks 8, 11
- ✅ All event types handled — Task 7
- ✅ Reconnect/backoff + malformed-event tolerance — Tasks 7, 8, 11
- ✅ All listed REST endpoints — Tasks 13–16
- ✅ OpenAPI at `/docs` — free via FastAPI (Task 17)
- ✅ Dashboard integration w/ Recharts + `VITE_INSIGHTS_URL` — Task 20
- ✅ CORS — Task 17
- ✅ Stack (FastAPI, asyncpg, Alembic, httpx, pydantic-settings, pytest-asyncio, testcontainers, Docker Compose) — Tasks 1, 3, 4, 5, 19
- ✅ Project layout matches spec — established in Task 1 + file structure
- ✅ Unit/integration/e2e testing strategy — Tasks 2, 5, 7, 8, 9, 10, 13–15, 18, 21
- ✅ Config env vars — Task 2
- ⚠️ Retention policy using `INSIGHTS_EVENTS_RETENTION_DAYS` — declared but not wired to a Timescale retention policy; intentionally deferred (spec's open question #1/#3 also not in scope).

**Placeholder scan:** No TODO / TBD / "add error handling" in steps. All code blocks are complete.

**Type consistency:** `EventAction` fields consistent across Tasks 7, 9. `AgentSummary` / `TimeseriesPoint` names consistent between schemas (Task 12) and usage (Tasks 14, 16, 20). API paths consistent `/api/v1/insights` prefix across routers (Tasks 16, 17) and dashboard client (Task 20).

No changes required.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-15-lattice-insights-python-analytics.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
