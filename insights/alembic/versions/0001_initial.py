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

    # Plain materialized view: tasks_by_minute
    # Note: Originally intended as a Timescale continuous aggregate, but the
    # `tasks` source table is not a hypertable (it's keyed by task id, not time),
    # and Timescale requires continuous aggregates to source from a hypertable.
    # Falling back to a plain materialized view; refresh it on a schedule at the
    # application layer (or via pg_cron) instead of add_continuous_aggregate_policy.
    op.execute("""
        CREATE MATERIALIZED VIEW tasks_by_minute AS
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

    # Plain materialized view: agent_latency_1m
    # Same rationale as above plus: percentile_cont is not supported inside a
    # Timescale continuous aggregate.
    op.execute("""
        CREATE MATERIALIZED VIEW agent_latency_1m AS
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


def downgrade() -> None:
    op.execute("DROP MATERIALIZED VIEW IF EXISTS agent_latency_1m CASCADE")
    op.execute("DROP MATERIALIZED VIEW IF EXISTS tasks_by_minute CASCADE")
    op.drop_table("agent_status_history")
    op.drop_table("tasks")
    op.drop_table("events")
