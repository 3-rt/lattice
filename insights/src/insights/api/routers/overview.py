from fastapi import APIRouter

from ...analytics.overview import compute_overview
from ...db import session_scope
from ...schemas import OverviewResponse
from ...time_utils import parse_range

router = APIRouter()


@router.get("/overview", response_model=OverviewResponse)
async def overview(range: str = "24h"):
    async with session_scope() as session:
        data = await compute_overview(session, range_=parse_range(range))
    return OverviewResponse(range=range, **data)
