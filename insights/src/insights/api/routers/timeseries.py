from fastapi import APIRouter, HTTPException

from ...analytics.timeseries import ALLOWED_METRICS, compute_timeseries
from ...db import session_scope
from ...schemas import TimeseriesPoint, TimeseriesResponse
from ...time_utils import parse_bucket, parse_range

router = APIRouter()


@router.get("/tasks/timeseries", response_model=TimeseriesResponse)
async def tasks_timeseries(
    metric: str = "throughput",
    range: str = "24h",
    bucket: str = "5m",
):
    if metric not in ALLOWED_METRICS:
        raise HTTPException(status_code=400, detail=f"unknown metric '{metric}'")

    async with session_scope() as session:
        points = await compute_timeseries(
            session,
            metric=metric,
            range_=parse_range(range),
            bucket=parse_bucket(bucket),
        )
    return TimeseriesResponse(
        metric=metric,
        bucket=bucket,
        range=range,
        points=[TimeseriesPoint(**point) for point in points],
    )
