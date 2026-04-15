from fastapi import APIRouter, HTTPException

from ...analytics.cost import compute_cost_breakdown
from ...db import session_scope
from ...schemas import CostBreakdownResponse, CostRow
from ...time_utils import parse_range

router = APIRouter()


@router.get("/cost/breakdown", response_model=CostBreakdownResponse)
async def cost_breakdown(groupBy: str = "agent", range: str = "24h"):
    try:
        async with session_scope() as session:
            rows = await compute_cost_breakdown(
                session,
                group_by=groupBy,
                range_=parse_range(range),
            )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return CostBreakdownResponse(
        group_by=groupBy,
        range=range,
        rows=[CostRow(**row) for row in rows],
    )
