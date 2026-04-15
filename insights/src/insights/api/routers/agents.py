from fastapi import APIRouter, HTTPException

from ...analytics.agents import summarize_agents
from ...analytics.timeseries import ALLOWED_METRICS, compute_timeseries
from ...db import session_scope
from ...schemas import AgentSummary, AgentsResponse, TimeseriesPoint, TimeseriesResponse
from ...time_utils import parse_bucket, parse_range

router = APIRouter()


@router.get("/agents", response_model=AgentsResponse)
async def list_agents(range: str = "24h"):
    async with session_scope() as session:
        rows = await summarize_agents(session, range_=parse_range(range))
    return AgentsResponse(agents=[AgentSummary(**row) for row in rows])


@router.get("/agents/{name}/timeseries", response_model=TimeseriesResponse)
async def agent_timeseries(
    name: str,
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
            agent=name,
        )
    return TimeseriesResponse(
        metric=metric,
        bucket=bucket,
        range=range,
        points=[TimeseriesPoint(**point) for point in points],
    )
