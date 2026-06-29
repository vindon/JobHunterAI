"""
tools.py — External tool wrappers for JobHunterAI

All I/O with the outside world lives here:
  - Tavily web search (with 7-day freshness filter)
  - CSV writer → ~/Documents/JobHunterAI/
  - Deduplication set loader (reads existing CSV)
"""

from __future__ import annotations

import csv
import json
import logging
import os
import time
from datetime import date
from pathlib import Path
from typing import Any

log = logging.getLogger("JobHunterAI.tools")


# ══════════════════════════════════════════════════════════════════
# TAVILY SEARCH
# ══════════════════════════════════════════════════════════════════

def build_tavily_client():
    """Lazy import + initialise Tavily client."""
    try:
        from tavily import TavilyClient
    except ImportError:
        raise RuntimeError(
            "tavily-python not installed.\n"
            "Run: pip install tavily-python"
        )
    api_key = os.environ.get("TAVILY_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError(
            "TAVILY_API_KEY not set.\n"
            "Get a free key at https://app.tavily.com and add to .env"
        )
    return TavilyClient(api_key=api_key)


def search_jobs(query: str, max_results: int = 5, days_back: int = 7) -> list[dict]:
    """
    Run one Tavily query with a recency filter.
    Returns raw result dicts from Tavily.
    Retries once on transient failure.
    """
    client = build_tavily_client()

    for attempt in (1, 2):
        try:
            resp = client.search(
                query=query,
                search_depth="advanced",
                max_results=max_results,
                include_answer=False,
                include_raw_content=False,
                days=days_back,               # ← 7-day freshness window
            )
            results = resp.get("results", [])
            log.debug(f"  Tavily [{attempt}]: '{query[:60]}' → {len(results)} results")
            return results
        except Exception as exc:
            log.warning(f"  Tavily attempt {attempt} failed: {exc}")
            if attempt == 1:
                time.sleep(2)
    return []


def search_jobs_parallel(queries: list[str], max_results: int = 5) -> dict[str, list[dict]]:
    """
    Run multiple Tavily queries.
    Returns {query: [results]} mapping.
    Uses sequential calls (Tavily free tier has rate limits).
    """
    results: dict[str, list[dict]] = {}
    for i, query in enumerate(queries):
        log.info(f"  Search [{i+1}/{len(queries)}]: {query[:70]}...")
        results[query] = search_jobs(query, max_results=max_results)
        if i < len(queries) - 1:
            time.sleep(0.5)   # gentle rate limiting
    return results


# ══════════════════════════════════════════════════════════════════
# CSV OUTPUT — saves to ~/Documents/JobHunterAI/
# ══════════════════════════════════════════════════════════════════

CSV_HEADERS = [
    "Role / Position Title", "Company / Hiring Org", "Country",
    "Job Type", "Remote Scope", "Source Portal", "Date Found",
    "Urgency", "Fit Score", "Status", "Salary / Rate",
    "Fit Notes", "Direct Link",
]

LOG_HEADERS = ["Run Date", "New Jobs", "Total Jobs", "Queries Run", "Duration (s)", "Notes"]


def get_output_dir() -> Path:
    """
    Returns ~/Documents/JobHunterAI/, creating it if needed.
    Overrideable via OUTPUT_DIR env var.
    """
    custom = os.environ.get("OUTPUT_DIR", "").strip()
    if custom:
        out = Path(custom)
    else:
        out = Path.home() / "Documents" / "JobHunterAI"
    out.mkdir(parents=True, exist_ok=True)
    return out


def get_csv_path() -> Path:
    """Single master CSV file — all runs append to this."""
    return get_output_dir() / "jobs_tracker.csv"


def get_log_csv_path() -> Path:
    """Run log CSV."""
    return get_output_dir() / "run_log.csv"


def _ensure_csv_headers(path: Path, headers: list[str]) -> None:
    """Write header row if the file is new or empty."""
    if not path.exists() or path.stat().st_size == 0:
        with open(path, "w", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow(headers)
        log.info(f"  Created CSV: {path}")


def load_existing_keys(csv_path: Path | None = None) -> set[tuple[str, str, str]]:
    """
    Read existing (role, company, country) dedup keys from the master CSV.
    Returns empty set if file doesn't exist yet.
    """
    path = csv_path or get_csv_path()
    if not path.exists():
        return set()
    keys: set[tuple[str, str, str]] = set()
    try:
        with open(path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                role    = str(row.get("Role / Position Title", "")).lower()[:50]
                company = str(row.get("Company / Hiring Org", "")).lower()[:30]
                country = str(row.get("Country", "")).lower()[:20]
                if role and company:
                    keys.add((role, company, country))
        log.info(f"  Loaded {len(keys)} existing keys from {path.name}")
    except Exception as exc:
        log.warning(f"  Could not read existing CSV: {exc}")
    return keys


def append_jobs_to_csv(job_rows: list[list[str]]) -> int:
    """
    Append new job rows to the master CSV.
    Creates the file with headers if it doesn't exist.
    Returns number of rows written.
    """
    if not job_rows:
        return 0
    path = get_csv_path()
    _ensure_csv_headers(path, CSV_HEADERS)
    try:
        with open(path, "a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerows(job_rows)
        log.info(f"  ✅ Appended {len(job_rows)} rows → {path}")
        return len(job_rows)
    except Exception as exc:
        log.error(f"  ❌ CSV write failed: {exc}")
        return 0


def log_run_to_csv(
    run_date: str,
    new_jobs: int,
    queries_run: int,
    duration_secs: float,
    notes: str = "",
) -> None:
    """Append a run record to the run log CSV."""
    path = get_log_csv_path()
    _ensure_csv_headers(path, LOG_HEADERS)
    try:
        # Count total jobs across all runs
        jobs_csv = get_csv_path()
        total = 0
        if jobs_csv.exists():
            with open(jobs_csv, newline="", encoding="utf-8") as f:
                total = max(0, sum(1 for _ in f) - 1)   # minus header
        with open(path, "a", newline="", encoding="utf-8") as f:
            csv.writer(f).writerow([
                run_date, new_jobs, total,
                queries_run, f"{duration_secs:.1f}", notes,
            ])
    except Exception as exc:
        log.warning(f"  Run log write failed: {exc}")


def get_output_url() -> str:
    """Return the local file path as a string for display."""
    return str(get_csv_path())
