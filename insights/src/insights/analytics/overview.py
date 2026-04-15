from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def compute_overview(session: AsyncSession, *, range_: timedelta) -> dict:
    since = datetime.now(timezone.utc) - range_
    result = await session.execute(
        text(
            """
            SELECT
                count(*) AS total,
                count(*) FILTER (WHERE status = 'completed') AS completed,
                count(*) FILTER (WHERE status IN ('failed', 'canceled')) AS failed,
                percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)
                    FILTER (WHERE latency_ms IS NOT NULL) AS p50,
                percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)
                    FILTER (WHERE latency_ms IS NOT NULL) AS p95,
                coalesce(sum(cost), 0) AS total_cost
            FROM tasks
            WHERE created_at >= :since
            """
        ),
        {"since": since},
    )
    row = result.one()
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
