from __future__ import annotations
from collections.abc import Iterable
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from .. import models
from .handlers import EventAction


async def apply_actions(session: AsyncSession, actions: Iterable[EventAction]) -> None:
    for a in actions:
        if a.kind == "event_insert":
            stmt = insert(models.Event).values(**a.data).on_conflict_do_nothing(
                index_elements=["event_id", "ts"]
            )
            await session.execute(stmt)
        elif a.kind == "task_upsert":
            data = {k: v for k, v in a.data.items() if v is not None}
            data.setdefault("status", "submitted")
            stmt = insert(models.Task).values(**data)
            update_cols = {c: stmt.excluded[c] for c in data.keys() if c != "id"}
            if update_cols:
                stmt = stmt.on_conflict_do_update(index_elements=["id"], set_=update_cols)
            else:
                stmt = stmt.on_conflict_do_nothing(index_elements=["id"])
            await session.execute(stmt)
        elif a.kind == "task_update":
            task_id = a.data["id"]
            fields = {k: v for k, v in a.data.items() if k != "id" and v is not None}
            if not fields:
                continue
            await session.execute(
                models.Task.__table__.update()
                .where(models.Task.id == task_id)
                .values(**fields)
            )
        elif a.kind == "agent_status_insert":
            await session.execute(insert(models.AgentStatusHistory).values(**a.data))
