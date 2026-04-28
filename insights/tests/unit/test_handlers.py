import pytest
from datetime import datetime, timezone
from insights.ingestion.handlers import handle_event, EventAction


def _dt(s: str) -> datetime:
    return datetime.fromisoformat(s).replace(tzinfo=timezone.utc)


def test_task_created_upserts_task_and_logs_event():
    actions = handle_event(
        event_id="42",
        ts=_dt("2026-04-15T10:00:00"),
        type_="task:created",
        payload={"id": "t1", "status": "submitted", "createdAt": "2026-04-15T10:00:00Z"},
    )
    kinds = [a.kind for a in actions]
    assert "event_insert" in kinds
    assert "task_upsert" in kinds
    task = next(a for a in actions if a.kind == "task_upsert")
    assert task.data["id"] == "t1"
    assert task.data["status"] == "submitted"


def test_task_routed_updates_agent_and_category():
    actions = handle_event(
        event_id="43",
        ts=_dt("2026-04-15T10:00:01"),
        type_="task:routed",
        payload={"id": "t1", "agent": "claude-code", "category": "coding", "reason": "best fit"},
    )
    update = next(a for a in actions if a.kind == "task_update")
    assert update.data["assigned_agent"] == "claude-code"
    assert update.data["category"] == "coding"
    assert update.data["routing_reason"] == "best fit"


def test_task_completed_sets_latency_and_completed_at():
    actions = handle_event(
        event_id="44",
        ts=_dt("2026-04-15T10:00:05"),
        type_="task:completed",
        payload={"id": "t1", "latencyMs": 4000, "cost": 0.012},
    )
    update = next(a for a in actions if a.kind == "task_update")
    assert update.data["status"] == "completed"
    assert update.data["latency_ms"] == 4000
    assert update.data["cost"] == 0.012
    assert update.data["completed_at"] == _dt("2026-04-15T10:00:05")


def test_agent_status_appends_history():
    actions = handle_event(
        event_id="45",
        ts=_dt("2026-04-15T10:01:00"),
        type_="agent:status",
        payload={"name": "codex", "status": "offline"},
    )
    hist = next(a for a in actions if a.kind == "agent_status_insert")
    assert hist.data == {"agent": "codex", "status": "offline", "ts": _dt("2026-04-15T10:01:00")}


def test_unknown_event_only_logs():
    actions = handle_event(
        event_id="99",
        ts=_dt("2026-04-15T10:02:00"),
        type_="workflow:step",
        payload={"foo": "bar"},
    )
    kinds = [a.kind for a in actions]
    assert kinds == ["event_insert"]
