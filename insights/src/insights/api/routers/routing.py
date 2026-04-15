from fastapi import APIRouter

from ...analytics.routing import compute_routing_effectiveness
from ...db import session_scope
from ...schemas import RoutingCategory, RoutingEffectivenessResponse
from ...time_utils import parse_range

router = APIRouter()


@router.get("/routing/effectiveness", response_model=RoutingEffectivenessResponse)
async def routing_effectiveness(range: str = "24h"):
    async with session_scope() as session:
        rows = await compute_routing_effectiveness(session, range_=parse_range(range))
    return RoutingEffectivenessResponse(
        categories=[RoutingCategory(**row) for row in rows]
    )
