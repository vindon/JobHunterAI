"""
models.py — SQLModel ORM table definitions for JobHunterAI API

Two tables:
  - Job       — individual job listings (imported from CSV or written by agent)
  - RunRecord — summary record of each agent run
"""

from __future__ import annotations

import json
from datetime import date, datetime
from typing import Optional

from sqlmodel import Field, SQLModel


# ══════════════════════════════════════════════════════════════════
# JOB TABLE
# ══════════════════════════════════════════════════════════════════


class Job(SQLModel, table=True):
    """
    Persisted job listing.

    Column names are snake_case; CSV column mapping is handled in
    api/services/csv_import.py.
    """

    __tablename__ = "job"

    id: Optional[int] = Field(default=None, primary_key=True)

    # ── Identity ─────────────────────────────────────────────────
    role: str = Field(index=True)
    company: str = Field(index=True)
    country: str = Field(index=True)

    # ── Classification ───────────────────────────────────────────
    job_type: str = Field(default="Unknown")
    remote_scope: str = Field(default="🌐 Remote")
    urgency: str = Field(default="⚡ Active")

    # ── Source ───────────────────────────────────────────────────
    source_portal: str = Field(default="")
    date_found: Optional[date] = Field(default=None)
    direct_link: str = Field(default="")

    # ── Enrichment ───────────────────────────────────────────────
    fit_score: int = Field(default=0, ge=0, le=10)
    status: str = Field(default="🆕 New", index=True)
    salary_hint: str = Field(default="")
    fit_notes: str = Field(default="")

    # ── User notes ───────────────────────────────────────────────
    notes: str = Field(default="")

    # ── Metadata ─────────────────────────────────────────────────
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ══════════════════════════════════════════════════════════════════
# RUN RECORD TABLE
# ══════════════════════════════════════════════════════════════════


class RunRecord(SQLModel, table=True):
    """
    Summary record saved after each agent run completes.

    top_jobs is stored as a JSON string and must be
    serialised/deserialised explicitly.
    """

    __tablename__ = "runrecord"

    id: Optional[int] = Field(default=None, primary_key=True)

    run_id: str = Field(unique=True, index=True)
    run_date: Optional[date] = Field(default=None)
    duration_secs: float = Field(default=0.0)
    queries_run: int = Field(default=0)
    raw_results: int = Field(default=0)
    parsed_ok: int = Field(default=0)
    new_added: int = Field(default=0)
    dupes_skipped: int = Field(default=0)

    # JSON-encoded list[str] of top job titles
    top_jobs: str = Field(default="[]")

    summary: str = Field(default="")
    created_at: datetime = Field(default_factory=datetime.utcnow)

    # ── Helpers ──────────────────────────────────────────────────

    def top_jobs_list(self) -> list[str]:
        """Decode top_jobs JSON string to a Python list."""
        try:
            return json.loads(self.top_jobs)
        except (json.JSONDecodeError, TypeError):
            return []

    def set_top_jobs(self, jobs: list[str]) -> None:
        """Encode a list of job titles into the top_jobs JSON field."""
        self.top_jobs = json.dumps(jobs)
