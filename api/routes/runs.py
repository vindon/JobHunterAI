"""
routes/runs.py — Agent run management endpoints.

Prefix: /api/runs

Endpoints
---------
  POST  /start            Start a new agent run in the background
  GET   /stream/{run_id}  Server-Sent Events stream of log output
  GET   /history          List all completed run records (newest first)
  GET   /history/{run_id} Single run record details
  GET   /active           Check whether a run is currently in progress
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from api.database import get_session
from api.middleware.rate_limit import rate_limiter
from api.models import RunRecord
from api.services.agent_runner import get_run_manager

log = logging.getLogger("JobHunterAI.api.routes.runs")

router = APIRouter(prefix="/api/runs", tags=["runs"])

# ── Request / response schemas ────────────────────────────────────────────────


class StartRunRequest(BaseModel):
    """Body for POST /start."""

    dry_run: bool = False
    queries_override: Optional[list[str]] = None


class StartRunResponse(BaseModel):
    """Response from POST /start."""

    run_id: str
    started_at: str


# ══════════════════════════════════════════════════════════════════
# POST /start
# ══════════════════════════════════════════════════════════════════


@router.post("/start", response_model=StartRunResponse)
async def start_run(body: StartRunRequest = StartRunRequest()) -> StartRunResponse:
    """
    Launch a new LangGraph agent run in a background thread.

    Rate limited to 3 starts per hour.  Returns immediately with a
    run_id that can be passed to /stream/{run_id} to follow progress.
    """
    # ── Rate limit check ─────────────────────────────────────────────────────
    rate_limiter.check_rate_limit()

    # ── Reject if a run is already active ────────────────────────────────────
    manager = get_run_manager()
    if manager.is_active():
        active_id = manager.active_run_id()
        raise HTTPException(
            status_code=409,
            detail=(
                f"An agent run is already in progress (run_id={active_id!r}). "
                "Wait for it to complete or stream its output first."
            ),
        )

    run_id = str(uuid.uuid4())[:8]
    started_at = datetime.utcnow()

    try:
        await manager.start_run(
            run_id=run_id,
            dry_run=body.dry_run,
            queries_override=body.queries_override,
        )
    except Exception as exc:
        log.error(f"Failed to start agent run: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start run: {exc}")

    log.info(f"Started agent run {run_id} (dry_run={body.dry_run})")
    return StartRunResponse(
        run_id=run_id,
        started_at=started_at.isoformat() + "Z",
    )


# ══════════════════════════════════════════════════════════════════
# GET /stream/{run_id}
# ══════════════════════════════════════════════════════════════════


@router.get("/stream/{run_id}")
async def stream_run(run_id: str):
    """
    Server-Sent Events stream for a running (or recently completed) agent run.

    Each event carries a JSON payload:
      { "type": "log"|"job"|"complete"|"error", "payload": str|dict }

    The stream ends when a "complete" or "error" event is received, or
    when the server places a sentinel on the queue (run finished).
    """
    try:
        from sse_starlette.sse import EventSourceResponse
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="sse_starlette is not installed — run: pip install sse-starlette",
        )

    manager = get_run_manager()
    ctx = manager.get_context(run_id)
    if ctx is None:
        raise HTTPException(
            status_code=404,
            detail=f"Run {run_id!r} not found. "
                   "Start a run first with POST /api/runs/start.",
        )

    async def event_generator():
        async for event in manager.stream_run(run_id):
            yield {"data": json.dumps(event)}

    return EventSourceResponse(event_generator())


# ══════════════════════════════════════════════════════════════════
# GET /history
# ══════════════════════════════════════════════════════════════════


@router.get("/history", response_model=list[RunRecord])
async def list_run_history(
    session: Session = Depends(get_session),
) -> list[RunRecord]:
    """Return all RunRecord rows sorted by created_at descending (newest first)."""
    try:
        records = session.exec(select(RunRecord)).all()
        return sorted(records, key=lambda r: r.created_at, reverse=True)
    except Exception as exc:
        log.error(f"Error fetching run history: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch run history")


# ══════════════════════════════════════════════════════════════════
# GET /history/{run_id}
# ══════════════════════════════════════════════════════════════════


@router.get("/history/{run_id}", response_model=RunRecord)
async def get_run_record(
    run_id: str,
    session: Session = Depends(get_session),
) -> RunRecord:
    """Return a single RunRecord by its run_id string, or 404 if not found."""
    try:
        records = session.exec(
            select(RunRecord).where(RunRecord.run_id == run_id)
        ).all()
        if not records:
            raise HTTPException(
                status_code=404,
                detail=f"Run record for run_id={run_id!r} not found",
            )
        return records[0]
    except HTTPException:
        raise
    except Exception as exc:
        log.error(f"Error fetching run record {run_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch run record")


# ══════════════════════════════════════════════════════════════════
# GET /active
# ══════════════════════════════════════════════════════════════════


@router.get("/active")
async def get_active_run() -> dict:
    """
    Check whether an agent run is currently in progress.

    Returns::

        { "active": true, "run_id": "abc123" }  # if running
        { "active": false, "run_id": null }      # if idle

    Also includes rate limit information::

        { ..., "rate_limit": { "runs_this_hour": 1, "max_per_hour": 3,
                               "cooldown_seconds": 0 } }
    """
    manager = get_run_manager()
    active = manager.is_active()
    active_id = manager.active_run_id() if active else None

    return {
        "active": active,
        "run_id": active_id,
        "rate_limit": {
            "runs_this_hour": rate_limiter.current_run_count(),
            "max_per_hour": 3,
            "cooldown_seconds": rate_limiter.get_cooldown_seconds(),
        },
    }
