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

def downgrade() -> None:
    op.drop_table("agent_status_history")
    op.drop_table("tasks")
    op.drop_table("events")
