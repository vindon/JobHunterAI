"""
agent_runner.py — Background agent execution with SSE log streaming.

Architecture
============
Each run is managed by a RunContext that owns:
  - A thread-safe queue.Queue for log events
  - Status tracking (running / complete / error)
  - The final RunReport result (once complete)

The agent is launched in a ThreadPoolExecutor so the FastAPI event loop
is never blocked. A custom logging.Handler (QueueHandler) captures every
log record emitted by the 'JobHunterAI' logger hierarchy and converts it
into an SSE-compatible event dict that is placed on the run's queue.

The SSE stream endpoint reads from the queue using asyncio.to_thread so
it cooperates with the event loop. A sentinel value (None) is placed on
the queue when the run finishes, signalling the stream to close.

Event types
-----------
  log      — plain log message string
  job      — dict with keys role, company, country, fit_score
  complete — dict with run summary fields
  error    — error message string
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import queue
import sys
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, AsyncGenerator, Optional

log = logging.getLogger("JobHunterAI.api.runner")

# ── Project root path so agent imports work ──────────────────────────────────
PROJECT_ROOT = Path(__file__).parent.parent.parent.resolve()

# Sentinel: placed on queue when run is finished (signals SSE generator to stop)
_SENTINEL = None


# ══════════════════════════════════════════════════════════════════
# LOGGING HANDLER — puts log records onto the run queue
# ══════════════════════════════════════════════════════════════════


class _QueueHandler(logging.Handler):
    """
    Logging handler that serialises log records into SSE event dicts
    and enqueues them for consumption by the SSE stream.
    """

    def __init__(self, run_queue: queue.Queue) -> None:
        super().__init__()
        self._queue = run_queue

    def emit(self, record: logging.LogRecord) -> None:
        try:
            msg = self.format(record)
            self._queue.put_nowait({"type": "log", "payload": msg})
        except Exception:
            self.handleError(record)


# ══════════════════════════════════════════════════════════════════
# RUN CONTEXT — per-run state container
# ══════════════════════════════════════════════════════════════════


@dataclass
class RunContext:
    """Holds all state for a single agent run."""

    run_id: str
    dry_run: bool = False
    queries_override: Optional[list[str]] = None
    event_queue: queue.Queue = field(default_factory=queue.Queue)
    status: str = "running"   # running | complete | error
    started_at: datetime = field(default_factory=datetime.utcnow)
    result: Optional[Any] = None   # RunReport on success, str on error


# ══════════════════════════════════════════════════════════════════
# RUN MANAGER — singleton orchestrator
# ══════════════════════════════════════════════════════════════════


class RunManager:
    """
    Singleton that manages active and completed agent runs.

    Usage (in FastAPI routes)::

        run_manager = get_run_manager()
        ctx = await run_manager.start_run(run_id, dry_run=False)
        async for event in run_manager.stream_run(run_id):
            ...
    """

    def __init__(self) -> None:
        self._active: dict[str, RunContext] = {}
        self._completed: dict[str, RunContext] = {}
        self._executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="agent-run")
        self._lock = threading.Lock()

    # ── Public API ────────────────────────────────────────────────────────────

    async def start_run(
        self,
        run_id: str,
        dry_run: bool = False,
        queries_override: Optional[list[str]] = None,
    ) -> RunContext:
        """
        Start a new agent run in a background thread.

        Returns the RunContext immediately; the agent executes asynchronously.
        """
        ctx = RunContext(
            run_id=run_id,
            dry_run=dry_run,
            queries_override=queries_override,
        )
        with self._lock:
            self._active[run_id] = ctx

        loop = asyncio.get_event_loop()
        loop.run_in_executor(
            self._executor,
            self._run_agent_sync,
            run_id,
        )
        return ctx

    async def stream_run(self, run_id: str) -> AsyncGenerator[dict, None]:
        """
        Async generator that yields SSE event dicts for the given run.

        Yields events until the run completes (sentinel received) or the
        queue is empty for 60 seconds (timeout guard).
        """
        with self._lock:
            ctx = self._active.get(run_id) or self._completed.get(run_id)

        if ctx is None:
            yield {"type": "error", "payload": f"Run {run_id!r} not found"}
            return

        while True:
            try:
                # Non-blocking wait via asyncio.to_thread so the event loop
                # remains responsive.
                event = await asyncio.to_thread(ctx.event_queue.get, True, 60.0)
            except queue.Empty:
                yield {"type": "error", "payload": "Stream timed out waiting for events"}
                break

            if event is _SENTINEL:
                break

            yield event

            if event.get("type") in ("complete", "error"):
                break

    def is_active(self) -> bool:
        """Return True if any run is currently in progress."""
        with self._lock:
            return bool(self._active)

    def active_run_id(self) -> Optional[str]:
        """Return the run_id of the currently active run, or None."""
        with self._lock:
            ids = list(self._active.keys())
            return ids[0] if ids else None

    def get_context(self, run_id: str) -> Optional[RunContext]:
        """Return the RunContext for a given run_id (active or completed)."""
        with self._lock:
            return self._active.get(run_id) or self._completed.get(run_id)

    # ── Background thread ─────────────────────────────────────────────────────

    def _run_agent_sync(self, run_id: str) -> None:
        """
        Execute the LangGraph agent in a background thread.

        This method:
          1. Attaches a QueueHandler to the 'JobHunterAI' root logger so all
             agent log output is forwarded to the SSE stream.
          2. Optionally sets JOBHUNTERAI_DRY_RUN env var.
          3. Calls agent.graph.run_agent() and captures the RunReport.
          4. Places a 'complete' or 'error' event on the queue, followed by
             the _SENTINEL to signal stream end.
          5. Moves the context from _active to _completed.
        """
        with self._lock:
            ctx = self._active.get(run_id)
        if ctx is None:
            return

        # ── Ensure project root is on sys.path ──────────────────────────────
        if str(PROJECT_ROOT) not in sys.path:
            sys.path.insert(0, str(PROJECT_ROOT))

        # ── Set dry-run env var ──────────────────────────────────────────────
        if ctx.dry_run:
            os.environ["JOBHUNTERAI_DRY_RUN"] = "1"
        else:
            os.environ.pop("JOBHUNTERAI_DRY_RUN", None)

        # ── Attach queue handler to root JobHunterAI logger ──────────────────
        jh_logger = logging.getLogger("JobHunterAI")
        handler = _QueueHandler(ctx.event_queue)
        handler.setFormatter(
            logging.Formatter(
                fmt="%(asctime)s  %(name)-20s  %(levelname)-7s  %(message)s",
                datefmt="%H:%M:%S",
            )
        )
        jh_logger.addHandler(handler)

        try:
            # ── Override search queries if requested ─────────────────────────
            if ctx.queries_override:
                _patch_profile_queries(ctx.queries_override)

            # ── Run the agent ────────────────────────────────────────────────
            from agent.graph import run_agent  # type: ignore[import]

            report = run_agent(config_path=str(PROJECT_ROOT / "config" / "profile.json"))
            ctx.result = report
            ctx.status = "complete"

            # Emit 'complete' event with run summary
            ctx.event_queue.put_nowait(
                {
                    "type": "complete",
                    "payload": {
                        "run_id": report.run_id,
                        "new_added": report.new_added,
                        "parsed_ok": report.parsed_ok,
                        "raw_results": report.raw_results,
                        "duration_secs": round(report.duration_secs, 2),
                        "top_jobs": report.top_jobs,
                        "errors": report.errors,
                    },
                }
            )

            # ── Persist run record to DB ─────────────────────────────────────
            _save_run_record(report)

        except Exception as exc:
            log.error(f"Agent run {run_id} failed: {exc}", exc_info=True)
            ctx.result = str(exc)
            ctx.status = "error"
            ctx.event_queue.put_nowait({"type": "error", "payload": str(exc)})

        finally:
            # Remove queue handler to prevent log record leaks
            jh_logger.removeHandler(handler)

            # Signal stream end
            ctx.event_queue.put_nowait(_SENTINEL)

            # Move from active → completed
            with self._lock:
                self._active.pop(run_id, None)
                self._completed[run_id] = ctx

            # Clean env var
            os.environ.pop("JOBHUNTERAI_DRY_RUN", None)


# ── Helpers ───────────────────────────────────────────────────────────────────


def _patch_profile_queries(queries: list[str]) -> None:
    """
    Temporarily set the search queries in the loaded profile.

    Note: This mutates a module-level variable if the profile was already
    loaded. For a personal tool running one job at a time this is acceptable.
    The override is applied by writing a temporary key that node_search reads.
    Since the profile is loaded fresh for each run_agent() call, we write
    the override to a well-known env var that nodes.py can pick up.
    """
    os.environ["JOBHUNTERAI_QUERY_OVERRIDE"] = json.dumps(queries)


def _save_run_record(report: Any) -> None:
    """Persist a RunReport to the RunRecord table after a successful run."""
    try:
        from sqlmodel import Session

        from api.database import engine
        from api.models import RunRecord

        record = RunRecord(
            run_id=report.run_id,
            run_date=report.run_date,
            duration_secs=report.duration_secs,
            queries_run=report.queries_run,
            raw_results=report.raw_results,
            parsed_ok=report.parsed_ok,
            new_added=report.new_added,
            dupes_skipped=report.dupes_skipped,
            summary=report.model_dump_json()[:2000],
        )
        record.set_top_jobs(report.top_jobs[:5])

        with Session(engine) as session:
            session.add(record)
            session.commit()

        log.info(f"Run record saved for run_id={report.run_id}")

    except Exception as exc:
        log.warning(f"Failed to persist run record: {exc}")


# ── Singleton ─────────────────────────────────────────────────────────────────

_run_manager: Optional[RunManager] = None
_manager_lock = threading.Lock()


def get_run_manager() -> RunManager:
    """Return the global RunManager singleton (created on first call)."""
    global _run_manager
    if _run_manager is None:
        with _manager_lock:
            if _run_manager is None:
                _run_manager = RunManager()
    return _run_manager
