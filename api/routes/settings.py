"""
routes/settings.py — Structured access to profile.json settings.

Prefix: /api/settings

This router provides a schema-aware view of the settings that live inside
config/profile.json, distinguishing them from the raw profile data exposed
by /api/profile.  The intent is to give the frontend typed, validated access
to the most commonly edited settings without dealing with the full profile blob.

Endpoints
---------
  GET    /                  Return structured settings object
  PUT    /                  Update settings fields in profile.json
  POST   /queries           Add a new search query
  DELETE /queries/{index}   Remove a query by index
  GET    /portals           List known portals with enabled status
  PUT    /portals           Update portal enabled/disabled status
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, field_validator

log = logging.getLogger("JobHunterAI.api.routes.settings")

router = APIRouter(prefix="/api/settings", tags=["settings"])

# ── Paths ─────────────────────────────────────────────────────────────────────
_PROJECT_ROOT = Path(__file__).parent.parent.parent.resolve()
_PROFILE_PATH = _PROJECT_ROOT / "config" / "profile.json"

# ── Known portals (default list) ─────────────────────────────────────────────
_DEFAULT_PORTALS = [
    "seek.com.au",
    "nz.seek.com",
    "reed.co.uk",
    "uk.indeed.com",
    "indeed.com",
    "linkedin.com/jobs",
    "jobs.gartner.com",
    "remoterocketship.com",
    "direct",
]

# ── Injection guard ───────────────────────────────────────────────────────────
_INJECTION_RE = re.compile(
    r"[<>{};\"'\\]|javascript:|data:|vbscript:|on\w+=",
    re.IGNORECASE,
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _read_profile() -> dict:
    if not _PROFILE_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="profile.json not found — copy profile.example.json and fill it in",
        )
    try:
        with open(_PROFILE_PATH, encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500, detail=f"profile.json invalid JSON: {exc}")


def _write_profile(data: dict) -> None:
    try:
        with open(_PROFILE_PATH, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Cannot write profile.json: {exc}")


def _profile_to_settings(profile: dict) -> dict:
    """Extract the structured settings subset from a full profile dict."""
    return {
        "search_queries": profile.get("search_queries", []),
        "broad_search_queries": profile.get("broad_search_queries", []),
        "exclude_keywords": profile.get("exclude_keywords", []),
        "fit_score_threshold": profile.get("fit_score_threshold", 5),
        "max_results_per_query": profile.get("max_results_per_query", 5),
        "days_back": profile.get("days_back", 7),
        "ollama_model": profile.get("ollama_model", "qwen3:8b"),
        "target_countries": profile.get("target_countries", []),
        "target_roles": profile.get("target_roles", []),
        "min_seniority": profile.get("min_seniority", "Senior Manager"),
    }


# ── Request schemas ───────────────────────────────────────────────────────────

class SettingsUpdate(BaseModel):
    """Partial settings update — all fields optional."""

    search_queries: Optional[list[str]] = None
    broad_search_queries: Optional[list[str]] = None
    exclude_keywords: Optional[list[str]] = None
    fit_score_threshold: Optional[int] = None
    max_results_per_query: Optional[int] = None
    days_back: Optional[int] = None
    ollama_model: Optional[str] = None
    target_countries: Optional[list[str]] = None
    target_roles: Optional[list[str]] = None
    min_seniority: Optional[str] = None


class AddQueryRequest(BaseModel):
    """Body for POST /queries."""

    query: str

    @field_validator("query")
    @classmethod
    def validate_query(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 10:
            raise ValueError("Query must be at least 10 characters")
        if _INJECTION_RE.search(v):
            raise ValueError("Query contains disallowed characters or patterns")
        return v


class PortalUpdate(BaseModel):
    """Body for PUT /portals — maps portal name → enabled bool."""

    portals: dict[str, bool]


# ══════════════════════════════════════════════════════════════════
# GET /
# ══════════════════════════════════════════════════════════════════


@router.get("/")
async def get_settings() -> JSONResponse:
    """
    Return the structured settings object derived from profile.json.

    Only the operationally meaningful settings are exposed here.
    For raw profile data use GET /api/profile.
    """
    try:
        profile = _read_profile()
        return JSONResponse(content=_profile_to_settings(profile))
    except HTTPException:
        raise
    except Exception as exc:
        log.error(f"Error reading settings: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read settings")


# ══════════════════════════════════════════════════════════════════
# PUT /
# ══════════════════════════════════════════════════════════════════


@router.put("/")
async def update_settings(body: SettingsUpdate) -> JSONResponse:
    """
    Update one or more settings fields in profile.json.

    Only fields explicitly provided in the request body are changed;
    omitted fields retain their current values.
    """
    try:
        profile = _read_profile()
        updates = body.model_dump(exclude_none=True)
        profile.update(updates)
        _write_profile(profile)
        log.info(f"Settings updated: {list(updates.keys())}")
        return JSONResponse(content=_profile_to_settings(profile))
    except HTTPException:
        raise
    except Exception as exc:
        log.error(f"Error updating settings: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update settings")


# ══════════════════════════════════════════════════════════════════
# POST /queries
# ══════════════════════════════════════════════════════════════════


@router.post("/queries")
async def add_query(body: AddQueryRequest) -> JSONResponse:
    """
    Append a new search query to the search_queries list.

    Validates:
      - Minimum 10 characters
      - No injection patterns (< > { } ; quotes, JS/data: URIs)
      - No duplicates (case-insensitive)

    Returns the updated list of search queries.
    """
    try:
        profile = _read_profile()
        queries: list[str] = profile.get("search_queries", [])

        # Duplicate check (case-insensitive)
        lower_existing = {q.lower() for q in queries}
        if body.query.lower() in lower_existing:
            raise HTTPException(
                status_code=409,
                detail=f"Query already exists: {body.query!r}",
            )

        queries.append(body.query)
        profile["search_queries"] = queries
        _write_profile(profile)

        log.info(f"Added search query: {body.query!r}")
        return JSONResponse(
            status_code=201,
            content={"search_queries": queries, "added": body.query},
        )

    except HTTPException:
        raise
    except Exception as exc:
        log.error(f"Error adding query: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to add query")


# ══════════════════════════════════════════════════════════════════
# DELETE /queries/{index}
# ══════════════════════════════════════════════════════════════════


@router.delete("/queries/{index}")
async def delete_query(index: int) -> JSONResponse:
    """
    Remove the search query at the given zero-based list index.

    Returns the updated list of search queries after removal.
    """
    try:
        profile = _read_profile()
        queries: list[str] = profile.get("search_queries", [])

        if index < 0 or index >= len(queries):
            raise HTTPException(
                status_code=404,
                detail=(
                    f"Index {index} is out of range "
                    f"(list has {len(queries)} queries, indices 0–{len(queries) - 1})"
                ),
            )

        removed = queries.pop(index)
        profile["search_queries"] = queries
        _write_profile(profile)

        log.info(f"Removed search query at index {index}: {removed!r}")
        return JSONResponse(
            content={"search_queries": queries, "removed": removed},
        )

    except HTTPException:
        raise
    except Exception as exc:
        log.error(f"Error removing query at index {index}: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to remove query")


# ══════════════════════════════════════════════════════════════════
# GET /portals
# ══════════════════════════════════════════════════════════════════


@router.get("/portals")
async def get_portals() -> JSONResponse:
    """
    Return the list of known job portals with their enabled/disabled status.

    The enabled state is read from profile.json key ``disabled_portals``
    (a list of portal names that are currently disabled).  If the key is
    absent, all portals are enabled by default.
    """
    try:
        profile = _read_profile()
        disabled: list[str] = profile.get("disabled_portals", [])
        disabled_lower = {p.lower() for p in disabled}

        portals = [
            {
                "name": portal,
                "enabled": portal.lower() not in disabled_lower,
            }
            for portal in _DEFAULT_PORTALS
        ]

        # Also include any portals in disabled_portals that aren't in the default list
        for d in disabled:
            if d.lower() not in {p.lower() for p in _DEFAULT_PORTALS}:
                portals.append({"name": d, "enabled": False})

        return JSONResponse(content={"portals": portals})

    except HTTPException:
        raise
    except Exception as exc:
        log.error(f"Error reading portals: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read portals")


# ══════════════════════════════════════════════════════════════════
# PUT /portals
# ══════════════════════════════════════════════════════════════════


@router.put("/portals")
async def update_portals(body: PortalUpdate) -> JSONResponse:
    """
    Update the enabled/disabled status of job portals.

    The body maps portal names to boolean enabled states.  Disabled
    portals are stored in profile.json under ``disabled_portals``.

    Example body::

        { "portals": { "seek.com.au": true, "reed.co.uk": false } }
    """
    try:
        profile = _read_profile()
        existing_disabled: set[str] = set(profile.get("disabled_portals", []))

        for portal_name, enabled in body.portals.items():
            if enabled:
                existing_disabled.discard(portal_name.lower())
                existing_disabled.discard(portal_name)
            else:
                existing_disabled.add(portal_name)

        profile["disabled_portals"] = sorted(existing_disabled)
        _write_profile(profile)

        log.info(f"Portal statuses updated for: {list(body.portals.keys())}")
        disabled_lower = {p.lower() for p in existing_disabled}
        portals = [
            {
                "name": portal,
                "enabled": portal.lower() not in disabled_lower,
            }
            for portal in _DEFAULT_PORTALS
        ]
        return JSONResponse(content={"portals": portals})

    except HTTPException:
        raise
    except Exception as exc:
        log.error(f"Error updating portals: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update portals")
