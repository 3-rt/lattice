from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def compute_routing_effectiveness(
    session: AsyncSession,
    *,
    range_: timedelta,
) -> list[dict]:
    since = datetime.now(timezone.utc) - range_
    result = await session.execute(
        text(
            """
            SELECT
                coalesce(category, 'uncategorized') AS category,
                assigned_agent AS agent,
                count(*) FILTER (WHERE status = 'completed') AS successes,
                count(*) FILTER (WHERE status IN ('failed', 'canceled')) AS failures,
                count(*) AS total
            FROM tasks
            WHERE created_at >= :since AND assigned_agent IS NOT NULL
            GROUP BY category, assigned_agent
            ORDER BY category, total DESC
            """
        ),
        {"since": since},
    )
    return [
        {
            "category": row.category,
            "agent": row.agent,
            "successes": row.successes,
            "failures": row.failures,
            "success_rate": (row.successes / row.total) if row.total else 0.0,
        }
        for row in result.all()
    ]
