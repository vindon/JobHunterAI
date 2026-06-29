"""
csv_import.py — Import jobs from the legacy CSV tracker into SQLite.

The CSV lives at ~/Documents/JobHunterAI/jobs_tracker.csv by default.
Columns (from sheet_headers() in agent/schemas.py):
    Role / Position Title, Company / Hiring Org, Country,
    Job Type, Remote Scope, Source Portal, Date Found,
    Urgency, Fit Score, Status, Salary / Rate, Fit Notes, Direct Link
"""

from __future__ import annotations

import csv
import logging
import re
from datetime import date, datetime
from pathlib import Path
from typing import Optional

from sqlmodel import Session, select

from api.models import Job

log = logging.getLogger("JobHunterAI.api.csv_import")

# ── Default CSV location ───────────────────────────────────────────────────────
DEFAULT_CSV_PATH = str(
    Path.home() / "Documents" / "JobHunterAI" / "jobs_tracker.csv"
)

# ── Column name → Job field mapping ────────────────────────────────────────────
COLUMN_MAP: dict[str, str] = {
    "Role / Position Title": "role",
    "Company / Hiring Org": "company",
    "Country": "country",
    "Job Type": "job_type",
    "Remote Scope": "remote_scope",
    "Source Portal": "source_portal",
    "Date Found": "date_found",
    "Urgency": "urgency",
    "Fit Score": "fit_score",
    "Status": "status",
    "Salary / Rate": "salary_hint",
    "Fit Notes": "fit_notes",
    "Direct Link": "direct_link",
}

_SCORE_RE = re.compile(r"(\d+)")


def _parse_fit_score(raw: str) -> int:
    """
    Parse a fit score string into an integer.

    Accepts formats like "9/10", "9", "9.5", "—".
    Returns 0 for any value that cannot be parsed.
    """
    if not raw or raw.strip() in ("—", "-", ""):
        return 0
    m = _SCORE_RE.search(raw)
    if m:
        return max(0, min(10, int(m.group(1))))
    return 0


def _parse_date(raw: str) -> Optional[date]:
    """Parse ISO date strings (YYYY-MM-DD). Returns None on failure."""
    if not raw or raw.strip() in ("—", "-", ""):
        return None
    raw = raw.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def _row_to_job(row: dict[str, str]) -> Optional[Job]:
    """
    Convert a CSV row dict to a Job ORM object.

    Returns None if the row is missing required fields (role or company).
    """
    mapped: dict[str, str] = {}
    for csv_col, field_name in COLUMN_MAP.items():
        mapped[field_name] = row.get(csv_col, "").strip()

    role = mapped.get("role", "")
    company = mapped.get("company", "")
    if not role or not company:
        return None

    return Job(
        role=role,
        company=company,
        country=mapped.get("country", ""),
        job_type=mapped.get("job_type", "Unknown"),
        remote_scope=mapped.get("remote_scope", "🌐 Remote"),
        source_portal=mapped.get("source_portal", ""),
        date_found=_parse_date(mapped.get("date_found", "")),
        urgency=mapped.get("urgency", "⚡ Active"),
        fit_score=_parse_fit_score(mapped.get("fit_score", "0")),
        status=mapped.get("status", "🆕 New"),
        salary_hint=mapped.get("salary_hint", ""),
        fit_notes=mapped.get("fit_notes", ""),
        direct_link=mapped.get("direct_link", ""),
        notes="",
    )


def _dedup_key(job: Job) -> tuple[str, str, str]:
    """Canonical deduplication key matching JobListing.dedup_key()."""
    return (
        job.role.lower()[:50],
        job.company.lower()[:30],
        job.country.lower()[:20],
    )


def import_csv_to_db(csv_path: str, session: Session) -> int:
    """
    Read a CSV file and import its rows into the Job table.

    Rows already present in the database (matched by role+company+country)
    are silently skipped.

    Args:
        csv_path: Absolute path to the CSV file.
        session:  An open SQLModel session.

    Returns:
        Number of new rows imported.
    """
    path = Path(csv_path)
    if not path.exists():
        log.warning(f"CSV file not found: {csv_path} — skipping import")
        return 0

    # Load existing keys from DB for dedup
    existing_jobs = session.exec(select(Job)).all()
    existing_keys: set[tuple[str, str, str]] = {
        _dedup_key(j) for j in existing_jobs
    }

    imported = 0
    skipped_dupe = 0
    skipped_invalid = 0

    with open(path, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        for row in reader:
            job = _row_to_job(row)
            if job is None:
                skipped_invalid += 1
                continue

            key = _dedup_key(job)
            if key in existing_keys:
                skipped_dupe += 1
                continue

            session.add(job)
            existing_keys.add(key)
            imported += 1

    session.commit()
    log.info(
        f"CSV import complete: {imported} imported, "
        f"{skipped_dupe} dupes skipped, "
        f"{skipped_invalid} invalid rows skipped"
    )
    return imported


def run_import_if_needed(session: Session, csv_path: str = DEFAULT_CSV_PATH) -> int:
    """
    Import the legacy CSV into the database if the Job table is empty.

    Called once at application startup. Safe to call repeatedly — it
    checks the row count before importing.

    Returns:
        Number of rows imported (0 if the table was already populated).
    """
    existing_count = len(session.exec(select(Job)).all())
    if existing_count > 0:
        log.info(
            f"Database already has {existing_count} jobs — skipping CSV import"
        )
        return 0

    log.info(f"Empty database detected — importing from {csv_path}")
    return import_csv_to_db(csv_path, session)
