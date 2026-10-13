"""
routes/jobs.py — CRUD endpoints for individual job listings.

Prefix: /api/jobs

Endpoints
---------
  GET    /             List jobs with filtering, sorting, search, pagination
  GET    /stats        Aggregate counts by status, country, score bucket
  GET    /export       Download all jobs as CSV
  DELETE /all          Permanently delete every job
  GET    /{id}         Single job by primary key
  PATCH  /{id}         Update status and/or notes
  DELETE /{id}         Soft-delete (set status to ❌ Pass) or hard-delete
"""

from __future__ import annotations

import csv
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlmodel import Session, select

from api.database import get_session
from api.models import Job

log = logging.getLogger("JobHunterAI.api.routes.jobs")

router = APIRouter(prefix="/api/jobs", tags=["jobs"])

# ── Pydantic schemas for request bodies ──────────────────────────────────────


class JobUpdate(BaseModel):
    """Fields that can be updated via PATCH /{id}."""

    status: Optional[str] = None
    notes: Optional[str] = None


# ══════════════════════════════════════════════════════════════════
# GET /
# ══════════════════════════════════════════════════════════════════


@router.get("/")
async def list_jobs(
    status: Optional[str] = Query(None, description="Filter by status string"),
    country: Optional[str] = Query(None, description="Filter by country (case-insensitive)"),
    min_score: Optional[int] = Query(None, ge=0, le=10, description="Minimum fit score (inclusive)"),
    max_score: Optional[int] = Query(None, ge=0, le=10, description="Maximum fit score (inclusive)"),
    search: Optional[str] = Query(None, description="Search text across role, company, fit_notes"),
    sort_by: Optional[str] = Query("fit_score", description="Field name to sort by"),
    sort_dir: Optional[str] = Query("desc", pattern="^(asc|desc)$", description="Sort direction"),
    sort: Optional[str] = Query(None, description="Shorthand sort e.g. fit_score_desc"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(50, ge=1, le=200, description="Results per page"),
    session: Session = Depends(get_session),
) -> dict:
    """
    Return all jobs matching the given filters.

    All filters are optional and combinable.  The default sort is
    fit_score descending so the best matches appear first.
    """
    try:
        statement = select(Job)
        jobs = session.exec(statement).all()

        # ── Filtering ─────────────────────────────────────────────────────────
        if status is not None:
            jobs = [j for j in jobs if j.status == status]

        if country is not None:
            country_lower = country.lower()
            jobs = [j for j in jobs if country_lower in j.country.lower()]

        if min_score is not None:
            jobs = [j for j in jobs if j.fit_score >= min_score]

        if max_score is not None:
            jobs = [j for j in jobs if j.fit_score <= max_score]

        if search is not None:
            term = search.lower()
            jobs = [
                j for j in jobs
                if (
                    term in j.role.lower()
                    or term in j.company.lower()
                    or term in (j.fit_notes or "").lower()
                )
            ]

        # ── Sorting ───────────────────────────────────────────────────────────
        VALID_SORT_FIELDS = {
            "id", "role", "company", "country", "fit_score",
            "date_found", "status", "urgency", "created_at",
        }
        # Support shorthand "fit_score_desc" style from frontend
        effective_sort_by = sort_by
        effective_sort_dir = sort_dir
        if sort:
            parts = sort.rsplit("_", 1)
            if len(parts) == 2 and parts[1] in ("asc", "desc"):
                effective_sort_by, effective_sort_dir = parts[0], parts[1]

        sort_field = effective_sort_by if effective_sort_by in VALID_SORT_FIELDS else "fit_score"
        reverse = effective_sort_dir != "asc"

        jobs = sorted(
            jobs,
            key=lambda j: (getattr(j, sort_field) is None, getattr(j, sort_field, "")),
            reverse=reverse,
        )

        # ── Pagination ────────────────────────────────────────────────────────
        total = len(jobs)
        total_pages = max(1, (total + per_page - 1) // per_page)
        offset = (page - 1) * per_page
        page_jobs = jobs[offset: offset + per_page]

        return {
            "jobs": [j.model_dump() for j in page_jobs],
            "total": total,
            "page": page,
            "per_page": per_page,
            "total_pages": total_pages,
        }

    except Exception as exc:
        log.error(f"Error listing jobs: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to list jobs")


# ══════════════════════════════════════════════════════════════════
# GET /stats
# ══════════════════════════════════════════════════════════════════


@router.get("/stats")
async def get_stats(session: Session = Depends(get_session)) -> dict:
    """
    Return aggregate counts for the dashboard.

    Returns
    -------
    dict with keys:
      total         — total number of jobs
      by_status     — dict mapping status string → count
      by_country    — dict mapping country → count
      by_score_bucket — dict mapping label → count
          "0-4"  — needs work / spam
          "5-6"  — borderline
          "7-8"  — good fit
          "9-10" — excellent fit
    """
    try:
        jobs = session.exec(select(Job)).all()

        by_status: dict[str, int] = {}
        by_country: dict[str, int] = {}
        by_score: dict[str, int] = {"0-4": 0, "5-6": 0, "7-8": 0, "9-10": 0}

        for job in jobs:
            # Status counts
            by_status[job.status] = by_status.get(job.status, 0) + 1

            # Country counts
            by_country[job.country] = by_country.get(job.country, 0) + 1

            # Score bucket counts
            score = job.fit_score
            if score <= 4:
                by_score["0-4"] += 1
            elif score <= 6:
                by_score["5-6"] += 1
            elif score <= 8:
                by_score["7-8"] += 1
            else:
                by_score["9-10"] += 1

        return {
            "total": len(jobs),
            "by_status": by_status,
            "by_country": by_country,
            "by_score_bucket": by_score,
        }

    except Exception as exc:
        log.error(f"Error computing stats: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to compute stats")


# ══════════════════════════════════════════════════════════════════
# GET /export
# ══════════════════════════════════════════════════════════════════


@router.get("/export")
async def export_jobs_csv(session: Session = Depends(get_session)) -> StreamingResponse:
    """Export all jobs as a UTF-8 CSV file."""
    try:
        jobs = session.exec(select(Job)).all()
        output = io.StringIO()
        writer = csv.writer(output)
        fields = ["id", "role", "company", "country", "job_type", "remote_scope",
                  "source_portal", "date_found", "urgency", "fit_score", "status",
                  "salary_hint", "fit_notes", "direct_link", "notes", "created_at"]
        writer.writerow(fields)
        for job in jobs:
            writer.writerow([getattr(job, f, "") for f in fields])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=jobhunter-export.csv"},
        )
    except Exception as exc:
        log.error(f"Error exporting jobs: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Export failed")


# ══════════════════════════════════════════════════════════════════
# DELETE /all
# ══════════════════════════════════════════════════════════════════


@router.delete("/all")
async def delete_all_jobs(session: Session = Depends(get_session)) -> dict:
    """Permanently delete every job record in the database."""
    try:
        jobs = session.exec(select(Job)).all()
        count = len(jobs)
        for job in jobs:
            session.delete(job)
        session.commit()
        log.warning(f"All {count} jobs permanently deleted")
        return {"deleted": count}
    except Exception as exc:
        log.error(f"Error deleting all jobs: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete all jobs")


# ══════════════════════════════════════════════════════════════════
# GET /{id}
# ══════════════════════════════════════════════════════════════════


@router.get("/{job_id}", response_model=Job)
async def get_job(job_id: int, session: Session = Depends(get_session)) -> Job:
    """Return a single job by its primary key, or 404 if not found."""
    try:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
        return job
    except HTTPException:
        raise
    except Exception as exc:
        log.error(f"Error fetching job {job_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch job")


# ══════════════════════════════════════════════════════════════════
# PATCH /{id}
# ══════════════════════════════════════════════════════════════════


@router.patch("/{job_id}", response_model=Job)
async def update_job(
    job_id: int,
    body: JobUpdate,
    session: Session = Depends(get_session),
) -> Job:
    """
    Update the status and/or notes fields of a job.

    Only status and notes are writable through this endpoint; all other
    fields are managed by the agent pipeline and are immutable via API.
    """
    try:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

        if body.status is not None:
            job.status = body.status
        if body.notes is not None:
            job.notes = body.notes

        session.add(job)
        session.commit()
        session.refresh(job)
        return job

    except HTTPException:
        raise
    except Exception as exc:
        log.error(f"Error updating job {job_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update job")


# ══════════════════════════════════════════════════════════════════
# DELETE /{id}
# ══════════════════════════════════════════════════════════════════


@router.delete("/{job_id}")
async def delete_job(
    job_id: int,
    hard: bool = Query(False, description="If true, permanently delete the row"),
    session: Session = Depends(get_session),
) -> dict:
    """
    Delete a job.

    By default this is a soft-delete: the status is set to "❌ Pass"
    so the record is preserved for history.  Pass ?hard=true for a
    permanent database deletion.
    """
    try:
        job = session.get(Job, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail=f"Job {job_id} not found")

        if hard:
            session.delete(job)
            session.commit()
            log.info(f"Hard-deleted job {job_id} ({job.role} @ {job.company})")
            return {"deleted": True, "hard": True, "id": job_id}
        else:
            job.status = "❌ Pass"
            session.add(job)
            session.commit()
            log.info(f"Soft-deleted job {job_id} ({job.role} @ {job.company})")
            return {"deleted": True, "hard": False, "id": job_id, "new_status": "❌ Pass"}

    except HTTPException:
        raise
    except Exception as exc:
        log.error(f"Error deleting job {job_id}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to delete job")


