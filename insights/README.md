# Lattice Insights

Python analytics service for the Lattice control plane. Ingests relay events via
SSE into TimescaleDB and exposes analytics over REST.

## Quickstart

    cd insights
    cp .env.example .env
    docker compose up -d postgres
    uv sync --dev
    uv run alembic upgrade head
    uv run uvicorn insights.main:app --reload --port 8000

Dashboard at http://localhost:3200/insights will display the data once the relay
is running at :3100 and has produced some tasks.

## Tests

    uv run pytest
