from __future__ import annotations
import logging
from datetime import datetime, timezone
from typing import Any

import httpx
from dateutil import parser as dtparser
from sqlalchemy.ext.asyncio import AsyncSession

from .handlers import EventAction
from .writer import apply_actions

log = logging.getLogger(__name__)


def _pick(d: dict, *keys, default=None):
    for k in keys:
        if k in d and d[k] is not None:
            return d[k]
    return default


def _parse_ts(value: Any) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    try:
        dt = dtparser.isoparse(str(value))
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return None


def _task_to_actions(task: dict) -> list[EventAction]:
    created = _parse_ts(_pick(task, "created_at", "createdAt")) or datetime.now(timezone.utc)
    return [EventAction("task_upsert", {
        "id": task["id"],
        "status": task.get("status", "submitted"),
        "category": task.get("category"),
        "assigned_agent": _pick(task, "assigned_agent", "agent"),
        "routing_reason": _pick(task, "routing_reason", "reason"),
        "latency_ms": _pick(task, "latency_ms", "latencyMs"),
        "cost": task.get("cost"),
        "workflow_id": _pick(task, "workflow_id", "workflowId"),
        "created_at": created,
        "completed_at": _parse_ts(_pick(task, "completed_at", "completedAt")),
    })]


def _agent_to_actions(agent: dict) -> list[EventAction]:
    name = _pick(agent, "name") or (agent.get("card") or {}).get("name")
    if not name:
        return []
    return [EventAction("agent_status_insert", {
        "agent": name,
        "ts": datetime.now(timezone.utc),
        "status": agent.get("status", "online"),
    })]


async def backfill(session: AsyncSession, *, relay_url: str) -> None:
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            tasks = (await client.get(f"{relay_url}/api/tasks")).json()
        except httpx.HTTPError as e:
            log.warning("backfill: tasks fetch failed: %s", e)
            tasks = []
        try:
            agents = (await client.get(f"{relay_url}/api/agents")).json()
        except httpx.HTTPError as e:
            log.warning("backfill: agents fetch failed: %s", e)
            agents = []

    tasks_list = tasks if isinstance(tasks, list) else tasks.get("tasks", [])
    agents_list = agents if isinstance(agents, list) else agents.get("agents", [])

    for t in tasks_list:
        await apply_actions(session, _task_to_actions(t))
    for a in agents_list:
        await apply_actions(session, _agent_to_actions(a))
    log.info("backfill complete: %d tasks, %d agents", len(tasks_list), len(agents_list))
