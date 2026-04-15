from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def summarize_agents(session: AsyncSession, *, range_: timedelta) -> list[dict]:
    since = datetime.now(timezone.utc) - range_
    result = await session.execute(
        text(
            """
            SELECT
                assigned_agent AS agent,
                count(*) AS task_count,
                count(*) FILTER (WHERE status = 'completed') AS completed,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)
                    FILTER (WHERE latency_ms IS NOT NULL) AS p50,
                percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
                    FILTER (WHERE latency_ms IS NOT NULL) AS p95,
                coalesce(sum(cost), 0) AS total_cost
            FROM tasks
            WHERE created_at >= :since AND assigned_agent IS NOT NULL
            GROUP BY assigned_agent
            ORDER BY task_count DESC
            """
        ),
        {"since": since},
    )
    return [
        {
            "agent": row.agent,
            "task_count": row.task_count,
            "success_rate": (row.completed / row.task_count) if row.task_count else 0.0,
            "p50_latency_ms": float(row.p50) if row.p50 is not None else None,
            "p95_latency_ms": float(row.p95) if row.p95 is not None else None,
            "total_cost": row.total_cost,
        }
        for row in result.all()
    ]
