"""
main.py — FastAPI application entry point for JobHunterAI API.

Start the server:
    python api/main.py
    # or
    uvicorn api.main:app --reload --port 8000

The API serves a React/Next.js dashboard on port 3000 by default.
CORS is configured to allow http://localhost:3000 and http://127.0.0.1:3000.

On startup:
  1. Database tables are created (idempotent)
  2. The legacy CSV is imported if the Job table is empty
"""

from __future__ import annotations

import logging
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import Session, select

# ── Ensure project root is importable so agent/* can be imported later ────────
_PROJECT_ROOT = Path(__file__).parent.parent.resolve()
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

from api.database import create_db_and_tables, engine
from api.models import Job
from api.routes import jobs as jobs_router
from api.routes import profile as profile_router
from api.routes import runs as runs_router
from api.routes import settings as settings_router
from api.services.agent_runner import get_run_manager
from api.services.csv_import import DEFAULT_CSV_PATH, run_import_if_needed

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(name)-28s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("JobHunterAI.api")


# ══════════════════════════════════════════════════════════════════
# LIFESPAN — startup / shutdown
# ══════════════════════════════════════════════════════════════════


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    FastAPI lifespan context manager.

    Startup: initialise the database, import CSV if empty.
    Shutdown: (no-op — SQLModel engine handles connection cleanup).
    """
    log.info("JobHunterAI API starting up…")

    # Create tables
    create_db_and_tables()

    # Auto-import CSV if the Job table is empty
    with Session(engine) as session:
        run_import_if_needed(session, csv_path=DEFAULT_CSV_PATH)

    # Initialise the RunManager singleton (creates the ThreadPoolExecutor)
    get_run_manager()

    log.info("JobHunterAI API ready — listening on http://0.0.0.0:8000")
    yield

    log.info("JobHunterAI API shutting down")


# ══════════════════════════════════════════════════════════════════
# APP FACTORY
# ══════════════════════════════════════════════════════════════════


app = FastAPI(
    title="JobHunterAI API",
    version="1.0.0",
    description=(
        "REST API for the JobHunterAI autonomous job search agent. "
        "Provides CRUD access to job listings, agent run management, "
        "and configuration endpoints for the React dashboard."
    ),
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(jobs_router.router)
app.include_router(runs_router.router)
app.include_router(profile_router.router)
app.include_router(settings_router.router)


# ══════════════════════════════════════════════════════════════════
# HEALTH CHECK
# ══════════════════════════════════════════════════════════════════


@app.get("/health", tags=["meta"])
async def health_check() -> JSONResponse:
    """
    Lightweight health check endpoint.

    Returns current job count and whether an agent run is in progress.
    Used by the frontend to confirm the API is reachable.
    """
    try:
        with Session(engine) as session:
            jobs = session.exec(select(Job)).all()
            jobs_count = len(jobs)
    except Exception:
        jobs_count = -1

    manager = get_run_manager()

    return JSONResponse(
        content={
            "status": "ok",
            "version": "1.0.0",
            "jobs_count": jobs_count,
            "active_run": manager.is_active(),
        }
    )


# ══════════════════════════════════════════════════════════════════
# DIRECT RUN
# ══════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    uvicorn.run(
        "api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=[str(_PROJECT_ROOT / "api")],
        log_level="info",
    )
