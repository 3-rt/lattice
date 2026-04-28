from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str
    db: str
    ingestor_lag_seconds: float | None = None


class OverviewResponse(BaseModel):
    range: str
    throughput: int
    success_rate: float
    p50_latency_ms: float | None
    p95_latency_ms: float | None
    total_cost: Decimal
    failed_count: int


class AgentSummary(BaseModel):
    agent: str
    task_count: int
    success_rate: float
    p50_latency_ms: float | None
    p95_latency_ms: float | None
    total_cost: Decimal


class AgentsResponse(BaseModel):
    agents: list[AgentSummary]


class TimeseriesPoint(BaseModel):
    ts: datetime
    value: float | None


class TimeseriesResponse(BaseModel):
    metric: str
    bucket: str
    range: str
    points: list[TimeseriesPoint]


class RoutingCategory(BaseModel):
    category: str
    agent: str
    successes: int
    failures: int
    success_rate: float


class RoutingEffectivenessResponse(BaseModel):
    categories: list[RoutingCategory]


class CostRow(BaseModel):
    key: str
    cost: Decimal


class CostBreakdownResponse(BaseModel):
    group_by: str
    range: str
    rows: list[CostRow]
