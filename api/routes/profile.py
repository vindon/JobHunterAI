"""
routes/profile.py — Read and write the user profile configuration.

Prefix: /api/profile

Endpoints
---------
  GET  /   Read config/profile.json as a dict
  PUT  /   Merge-update config/profile.json (preserves unknown keys)
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

log = logging.getLogger("JobHunterAI.api.routes.profile")

router = APIRouter(prefix="/api/profile", tags=["profile"])

# ── Profile path ──────────────────────────────────────────────────────────────
_PROJECT_ROOT = Path(__file__).parent.parent.parent.resolve()
_PROFILE_PATH = _PROJECT_ROOT / "config" / "profile.json"


def _read_profile() -> dict:
    """Load and return the profile JSON. Raises HTTPException if missing."""
    if not _PROFILE_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail=(
                f"Profile not found at {_PROFILE_PATH}. "
                "Copy config/profile.example.json → config/profile.json and fill it in."
            ),
        )
    try:
        with open(_PROFILE_PATH, encoding="utf-8") as fh:
            return json.load(fh)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"profile.json is not valid JSON: {exc}",
        )


def _write_profile(data: dict) -> None:
    """Serialise *data* back to profile.json with pretty-printing."""
    try:
        _PROFILE_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(_PROFILE_PATH, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2, ensure_ascii=False)
            fh.write("\n")
    except OSError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to write profile.json: {exc}",
        )


# ══════════════════════════════════════════════════════════════════
# GET /
# ══════════════════════════════════════════════════════════════════


@router.get("/")
async def get_profile() -> JSONResponse:
    """
    Return the full contents of config/profile.json.

    The response is the raw dict, including any unknown keys (e.g.
    ``_comment``).  Sensitive fields such as ``email`` are included
    because this API is localhost-only.
    """
    try:
        profile = _read_profile()
        return JSONResponse(content=profile)
    except HTTPException:
        raise
    except Exception as exc:
        log.error(f"Error reading profile: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to read profile")


# ══════════════════════════════════════════════════════════════════
# PUT /
# ══════════════════════════════════════════════════════════════════


@router.put("/")
async def update_profile(body: dict) -> JSONResponse:
    """
    Merge-update config/profile.json with the provided dict.

    The incoming dict is shallow-merged over the existing profile,
    meaning top-level keys in the body overwrite the matching keys in
    the profile while all other existing keys are preserved.

    To update a nested structure (e.g. search_queries), include the full
    replacement value for that key in the body.
    """
    try:
        # Load current profile (may 404 if not yet created)
        try:
            existing = _read_profile()
        except HTTPException as exc:
            if exc.status_code == 404:
                # Allow creation if profile.example.json exists
                example = _PROJECT_ROOT / "config" / "profile.example.json"
                if example.exists():
                    with open(example, encoding="utf-8") as fh:
                        existing = json.load(fh)
                else:
                    existing = {}
            else:
                raise

        # Shallow merge: body keys take precedence
        merged = {**existing, **body}

        _write_profile(merged)
        log.info("profile.json updated via PUT /api/profile")
        return JSONResponse(content=merged)

    except HTTPException:
        raise
    except Exception as exc:
        log.error(f"Error updating profile: {exc}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to update profile")
