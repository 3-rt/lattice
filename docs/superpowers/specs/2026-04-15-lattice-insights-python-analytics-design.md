# Lattice Insights — Python Analytics Service

**Date:** 2026-04-15
**Status:** Design approved, pending implementation plan
**Author:** Basil Liu (w/ Claude)

## Summary

A standalone Python microservice that ingests the Lattice relay's event stream, persists it in TimescaleDB, and exposes an analytics REST API consumed by the existing React dashboard. Read-only consumer of relay state. Backend-engineering focus: async streaming ingestion, time-series storage, REST API design, Docker Compose stack.

## Goals

- Add a real, production-shaped Python service alongside the TypeScript orchestration plane.
- Demonstrate backend-engineering breadth: async I/O, stream consumption, time-series modeling, relational schema design, containerized deployment.
- Integrate visibly into the existing dashboard so the demo tells one cohesive story.

## Non-goals

- ML, anomaly detection, or predictive features. (Out of scope; user has a separate ML project.)
- Authentication / multi-tenancy. Matches the relay's v1 no-auth posture.
- Writing back to the relay. Read-only consumer.
- Replacing the relay's existing SQLite storage. Insights is a secondary analytical store.

## Architecture

```
  Relay (:3100) ──SSE──▶ Insights Ingestor ──▶ Postgres + TimescaleDB
                                                      ▲
                           FastAPI (:8000) ───────────┘
                                ▲
                                │ REST (CORS)
                          Dashboard (:3200)  ◀── new "Insights" route
```

Single Python process running two concerns in one event loop:

1. **Ingestor** — long-lived async task consuming `GET /api/events` (SSE) from the relay, normalizing events, batched-writing to Postgres.
2. **HTTP server** — FastAPI app serving `/api/v1/insights/*` analytics endpoints backed by Postgres queries.

Both share an `asyncpg`-backed SQLAlchemy 2.0 async engine. Postgres (with the TimescaleDB extension) runs in Docker Compose alongside the service.

## Data model

All timestamps UTC. Primary storage is Postgres 16 + TimescaleDB extension.

### `events` (hypertable on `ts`)

Raw event log for replay and debugging.

| column      | type         | notes                            |
|-------------|--------------|----------------------------------|
| id          | bigserial    | PK                               |
| event_id    | text         | relay-assigned SSE event ID      |
| ts          | timestamptz  | event time (hypertable dim)      |
| type        | text         | `task:created`, `agent:status`, … |
| payload     | jsonb        | raw event body                   |

Unique index on `event_id` for idempotent replay.

### `tasks`

Denormalized task snapshot, updated as events arrive.

| column           | type         | notes                      |
|------------------|--------------|----------------------------|
| id               | text         | PK (task id from relay)    |
| status           | text         |                            |
| category         | text nullable| inferred from routing      |
| assigned_agent   | text nullable|                            |
| routing_reason   | text nullable|                            |
| latency_ms       | int nullable |                            |
| cost             | numeric nullable |                        |
| workflow_id      | text nullable|                            |
| created_at       | timestamptz  | hypertable dim             |
| completed_at     | timestamptz nullable |                    |

### `agent_status_history` (hypertable on `ts`)

| column  | type        | notes                          |
|---------|-------------|--------------------------------|
| agent   | text        |                                |
| ts      | timestamptz | hypertable dim                 |
| status  | text        | online / offline / degraded    |

### Continuous aggregates

Defined as Timescale continuous aggregates so dashboard queries don't re-scan raw data.

- `tasks_by_minute(minute, status, count, avg_latency_ms, sum_cost)`
- `agent_latency_1m(minute, agent, p50_latency, p95_latency, count)`

Retention: raw `events` kept 30 days; `tasks` kept indefinitely; aggregates kept indefinitely. Configurable.

## Ingestion

### Startup backfill

On service start (before opening the SSE stream):

1. `GET http://relay:3100/api/tasks` — upsert all existing tasks.
2. `GET /api/agents` — seed `agent_status_history` with current status.

Uses `ON CONFLICT DO UPDATE` so re-running is safe.

### Live stream

1. Open SSE connection to `GET /api/events` via `httpx.AsyncClient`.
2. On reconnect, send `Last-Event-ID` header using the last persisted `event_id`. Relay already supports replay from this point.
3. Events are batched (up to N events or 250ms, whichever comes first) and inserted via a single transaction.
4. Handler per event type converts the payload into row inserts/upserts:
   - `task:created` → insert into `tasks` + `events`
   - `task:routed` → update `tasks.assigned_agent`, `routing_reason`, `category`
   - `task:progress` → update `tasks.status`
   - `task:completed` → update `tasks.status`, `latency_ms`, `cost`, `completed_at`
   - `task:failed` / `task:canceled` → update `tasks.status`, `completed_at`
   - `agent:registered` / `agent:deregistered` / `agent:status` → insert into `agent_status_history`
   - `workflow:*` → logged in `events` (no dedicated table in v1)

### Failure handling

- Network drop → exponential backoff (max 30s) + reconnect with `Last-Event-ID`.
- Postgres unreachable at startup → retry loop, service stays up but unhealthy.
- Malformed event → log, persist to `events` anyway (debugging value), skip table-specific handler.

## API surface

All endpoints under `/api/v1/insights`. JSON responses, Pydantic-validated. OpenAPI docs at `/docs`.

| Endpoint                                  | Description                                          |
|-------------------------------------------|------------------------------------------------------|
| `GET /health`                             | liveness + DB connectivity + ingestor lag            |
| `GET /overview?range=24h`                 | throughput, p50/p95 latency, success rate, total cost|
| `GET /agents`                             | per-agent summary table                              |
| `GET /agents/{name}/timeseries`           | metric timeseries for one agent                      |
| `GET /routing/effectiveness`              | per-category routing win rates                       |
| `GET /cost/breakdown?groupBy=agent&range=`| stacked cost by group                                |
| `GET /tasks/timeseries`                   | throughput/latency over time                         |

Query params standardized: `range` (e.g. `1h`, `24h`, `7d`), `bucket` (e.g. `1m`, `5m`, `1h`), `metric` (enum).

## Dashboard integration

- New "Insights" route added to the existing React dashboard (`packages/dashboard`).
- Charts rendered with Recharts (already a reasonable fit; confirm existing chart lib during implementation and reuse if one is already installed).
- Four initial views:
  - Overview tiles (throughput, p95, success rate, cost)
  - Throughput line chart (last 24h, 5m buckets)
  - Agent performance table (with latency sparkline per row)
  - Cost breakdown stacked bar
- Base URL configurable via `VITE_INSIGHTS_URL`, defaulting to `http://localhost:8000`.
- FastAPI CORS middleware permits `http://localhost:3200`.

## Stack & tooling

- **Runtime:** Python 3.12
- **Web:** FastAPI + uvicorn (single worker; uvloop)
- **DB:** asyncpg + SQLAlchemy 2.0 async
- **Migrations:** Alembic
- **HTTP:** httpx (SSE + REST)
- **Config:** pydantic-settings (env-driven)
- **Testing:** pytest + pytest-asyncio + testcontainers-python (real Postgres for integration tests)
- **Packaging:** uv + pyproject.toml
- **Deployment:** Dockerfile + docker-compose.yml

## Project layout

```
insights/                              # top-level, not an npm workspace
├── pyproject.toml
├── uv.lock
├── docker-compose.yml                 # postgres + insights service
├── Dockerfile
├── alembic.ini
├── alembic/versions/
├── src/insights/
│   ├── __init__.py
│   ├── main.py                        # FastAPI app + lifespan (starts ingestor)
│   ├── config.py                      # pydantic-settings
│   ├── db.py                          # async engine, session factory
│   ├── models.py                      # SQLAlchemy ORM models
│   ├── schemas.py                     # Pydantic response models
│   ├── ingestion/
│   │   ├── __init__.py
│   │   ├── sse_client.py              # async SSE consumer w/ reconnect
│   │   ├── backfill.py                # startup REST pull
│   │   └── handlers.py                # event → rows
│   ├── analytics/                     # pure query logic, no HTTP
│   │   ├── overview.py
│   │   ├── agents.py
│   │   ├── routing.py
│   │   └── timeseries.py
│   └── api/
│       ├── __init__.py
│       └── routers/{overview,agents,routing,timeseries,health}.py
└── tests/
    ├── unit/                          # handlers, query builders
    ├── integration/                   # testcontainers Postgres
    └── e2e/                           # docker-compose smoke
```

## Testing strategy

- **Unit:** event payload → row conversion; query builders (parameterization, bucket math).
- **Integration:** spin Postgres via testcontainers; run real Timescale migrations; assert hypertables and continuous aggregates materialize correctly; run analytics queries against seeded data.
- **End-to-end:** docker-compose stack + mock relay that emits a known event script; assert analytics endpoints reflect those events within N seconds.

## Configuration

Environment variables (12-factor):

- `INSIGHTS_DATABASE_URL` — `postgresql+asyncpg://…`
- `INSIGHTS_RELAY_URL` — default `http://localhost:3100`
- `INSIGHTS_PORT` — default `8000`
- `INSIGHTS_LOG_LEVEL` — default `INFO`
- `INSIGHTS_CORS_ORIGINS` — CSV, default `http://localhost:3200`
- `INSIGHTS_EVENTS_RETENTION_DAYS` — default `30`

## Open questions (to resolve during planning)

- Exact metric catalog for `timeseries` endpoints (tentative: `throughput`, `latency_p50`, `latency_p95`, `success_rate`, `cost`).
- Whether to add a small "demo seeder" that pushes synthetic tasks to the relay so the insights dashboard looks alive without manual traffic.
- Whether the top-level `demo.sh` should include Insights (Docker Compose `up -d` the stack).

## Work not included in this spec

- ML-driven routing / prediction (separate future project).
- Anomaly detection.
- Alerting or notification fan-out.
- Long-term archive to object storage.
