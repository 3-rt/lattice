#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../insights"
docker compose up -d postgres
uv run alembic upgrade head
echo "Postgres ready. Start insights with: uv run uvicorn insights.main:app --port 8000"
