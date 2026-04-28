import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.routers import agents, cost, health, overview, routing, timeseries
from .config import get_settings
from .ingestion.orchestrator import ingestion_lifespan

logging.basicConfig(
    level=get_settings().log_level,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with ingestion_lifespan():
        yield


app = FastAPI(title="Lattice Insights", version="0.1.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET"],
    allow_headers=["*"],
)

prefix = "/api/v1/insights"
app.include_router(health.router, prefix=prefix, tags=["health"])
app.include_router(overview.router, prefix=prefix, tags=["overview"])
app.include_router(agents.router, prefix=prefix, tags=["agents"])
app.include_router(routing.router, prefix=prefix, tags=["routing"])
app.include_router(timeseries.router, prefix=prefix, tags=["timeseries"])
app.include_router(cost.router, prefix=prefix, tags=["cost"])
