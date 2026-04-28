from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

ALLOWED_METRICS = {"throughput", "latency_p50", "latency_p95", "success_rate", "cost"}

_METRIC_SQL = {
    "throughput": "count(*)::float",
    "latency_p50": "percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::float",
    "latency_p95": "percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::float",
    "success_rate": (
        "(count(*) FILTER (WHERE status = 'completed'))::float / NULLIF(count(*), 0)"
    ),
    "cost": "coalesce(sum(cost), 0)::float",
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
    params: dict[str, object] = {
        "since": since,
        "bucket": bucket,
    }
    if agent is not None:
        where += " AND assigned_agent = :agent"
        params["agent"] = agent

    result = await session.execute(
        text(
            f"""
            SELECT
                time_bucket(CAST(:bucket AS interval), created_at) AS ts,
                {_METRIC_SQL[metric]} AS value
            FROM tasks
            WHERE {where}
            GROUP BY ts
            ORDER BY ts
            """
        ),
        params,
    )
    return [{"ts": row.ts, "value": row.value} for row in result.all()]
