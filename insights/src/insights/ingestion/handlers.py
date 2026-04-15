from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from dateutil import parser as dtparser


@dataclass
class EventAction:
    kind: str            # event_insert | task_upsert | task_update | agent_status_insert
    data: dict[str, Any]


def _parse_ts(value: str | None, default: datetime) -> datetime:
    if not value:
        return default
    dt = dtparser.isoparse(value)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def handle_event(
    *, event_id: str, ts: datetime, type_: str, payload: dict[str, Any]
) -> list[EventAction]:
    actions: list[EventAction] = [
        EventAction("event_insert", {
            "event_id": event_id, "ts": ts, "type": type_, "payload": payload,
        })
    ]

    if type_ == "task:created":
        actions.append(EventAction("task_upsert", {
            "id": payload["id"],
            "status": payload.get("status", "submitted"),
            "created_at": _parse_ts(payload.get("createdAt"), ts),
            "category": payload.get("category"),
            "assigned_agent": payload.get("agent"),
        }))
    elif type_ == "task:routed":
        actions.append(EventAction("task_update", {
            "id": payload["id"],
            "assigned_agent": payload.get("agent"),
            "category": payload.get("category"),
            "routing_reason": payload.get("reason"),
        }))
    elif type_ == "task:progress":
        actions.append(EventAction("task_update", {
            "id": payload["id"],
            "status": payload.get("status", "working"),
        }))
    elif type_ == "task:completed":
        actions.append(EventAction("task_update", {
            "id": payload["id"],
            "status": "completed",
            "latency_ms": payload.get("latencyMs"),
            "cost": payload.get("cost"),
            "completed_at": ts,
        }))
    elif type_ in ("task:failed", "task:canceled"):
        actions.append(EventAction("task_update", {
            "id": payload["id"],
            "status": type_.split(":", 1)[1],
            "completed_at": ts,
        }))
    elif type_ == "task:input-required":
        actions.append(EventAction("task_update", {
            "id": payload["id"],
            "status": "input-required",
        }))
    elif type_ in ("agent:registered", "agent:deregistered", "agent:status"):
        status = payload.get("status")
        if type_ == "agent:registered":
            status = status or "online"
        elif type_ == "agent:deregistered":
            status = status or "offline"
        actions.append(EventAction("agent_status_insert", {
            "agent": payload.get("name") or payload.get("agent"),
            "ts": ts,
            "status": status or "unknown",
        }))
    # workflow:* and message:* are logged only

    return actions
