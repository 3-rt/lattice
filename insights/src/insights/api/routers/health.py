from fastapi import APIRouter
from sqlalchemy import text

from ...db import session_scope
from ...schemas import HealthResponse

router = APIRouter()


@router.get("/health", response_model=HealthResponse)
async def health():
    try:
        async with session_scope() as session:
            await session.execute(text("SELECT 1"))
        db = "ok"
    except Exception:
        db = "error"
    return HealthResponse(status="ok", db=db)
