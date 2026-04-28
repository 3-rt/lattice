from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_GROUP_COLS = {
    "agent": "coalesce(assigned_agent, 'unassigned')",
    "status": "status",
    "category": "coalesce(category, 'uncategorized')",
}


async def compute_cost_breakdown(
    session: AsyncSession,
    *,
    group_by: str,
    range_: timedelta,
) -> list[dict]:
    if group_by not in _GROUP_COLS:
        raise ValueError(f"invalid groupBy: {group_by}")

    since = datetime.now(timezone.utc) - range_
    result = await session.execute(
        text(
            f"""
            SELECT {_GROUP_COLS[group_by]} AS key, coalesce(sum(cost), 0) AS cost
            FROM tasks
            WHERE created_at >= :since
            GROUP BY key
            ORDER BY cost DESC
            """
        ),
        {"since": since},
    )
    return [{"key": row.key, "cost": row.cost} for row in result.all()]
