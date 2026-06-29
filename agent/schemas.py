"""
schemas.py — Pydantic v2 type contracts for JobHunterAI

Every job that enters the pipeline is validated here.
If it doesn't fit the schema, it is rejected before
it ever reaches the Google Sheet.
"""

from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Annotated, Any
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator
import re


# ══════════════════════════════════════════════════════════════════
# ENUMS
# ══════════════════════════════════════════════════════════════════

class JobType(str, Enum):
    FULL_TIME   = "Full-time"
    CONTRACT    = "Contract"
    PART_TIME   = "Part-time / Freelance"
    FRACTIONAL  = "Fractional"
    UNKNOWN     = "Unknown"


class RemoteScope(str, Enum):
    GLOBAL   = "🌍 Globally Remote"
    AU       = "🌏 Anywhere in AU"
    NZ       = "🇳🇿 NZ Remote"
    UK       = "🌐 Remote UK"
    US       = "🌐 Remote US"
    REMOTE   = "🌐 Remote"
    UNKNOWN  = "❓ Check listing"


class UrgencyLevel(str, Enum):
    URGENT = "🔥 URGENT"
    ACTIVE = "⚡ Active"


class ApplicationStatus(str, Enum):
    NEW       = "🆕 New"
    REVIEWING = "⏳ Reviewing"
    APPLIED   = "📤 Applied"
    INTERVIEW = "🎤 Interview"
    OFFER     = "✅ Offer"
    PASS      = "❌ Pass"


# ══════════════════════════════════════════════════════════════════
# JOB LISTING — core validated model
# ══════════════════════════════════════════════════════════════════

SPAM_PATTERNS = re.compile(
    r"(click here|earn \$|work from home fast|no experience required"
    r"|mlm|pyramid|adult|casino|crypto trading|binary options)",
    re.IGNORECASE,
)

SENIORITY_PATTERNS = re.compile(
    r"(senior|director|head of|vp|vice president|principal|lead|manager"
    r"|consultant|advisor|cpo|cto|cio|chief)",
    re.IGNORECASE,
)


class JobListing(BaseModel):
    """A single validated job opportunity."""

    # ── Identity ─────────────────────────────────────────────────
    role:        str = Field(..., min_length=4, max_length=120)
    company:     str = Field(..., min_length=2, max_length=100)
    country:     str = Field(..., min_length=2, max_length=60)

    # ── Classification ───────────────────────────────────────────
    job_type:    JobType     = JobType.UNKNOWN
    remote_scope: RemoteScope = RemoteScope.REMOTE
    urgency:     UrgencyLevel = UrgencyLevel.ACTIVE

    # ── Source ───────────────────────────────────────────────────
    source_portal: str = Field(..., min_length=2, max_length=60)
    link:          str = Field(..., min_length=10)         # raw str — URL validated below
    date_found:    date = Field(default_factory=date.today)

    # ── Enrichment (filled by Rank Agent) ────────────────────────
    fit_score:    int  = Field(default=0, ge=0, le=10)
    fit_notes:    str  = Field(default="", max_length=400)
    salary_hint:  str  = Field(default="", max_length=80)
    status:       ApplicationStatus = ApplicationStatus.NEW

    # ── Internal ─────────────────────────────────────────────────
    raw_snippet:  str  = Field(default="", exclude=True)   # not written to sheet
    search_query: str  = Field(default="", exclude=True)

    # ── Validators ───────────────────────────────────────────────

    @field_validator("role", "company", mode="before")
    @classmethod
    def strip_whitespace(cls, v: str) -> str:
        return " ".join(str(v).split())

    @field_validator("role")
    @classmethod
    def reject_spam_roles(cls, v: str) -> str:
        if SPAM_PATTERNS.search(v):
            raise ValueError(f"Spam pattern detected in role: {v!r}")
        return v

    @field_validator("link", mode="before")
    @classmethod
    def normalise_link(cls, v: str) -> str:
        v = str(v).strip()
        if not v.startswith(("http://", "https://")):
            v = "https://" + v
        return v

    @field_validator("fit_score", mode="before")
    @classmethod
    def coerce_score(cls, v: Any) -> int:
        try:
            return max(0, min(10, int(v)))
        except (TypeError, ValueError):
            return 0

    @model_validator(mode="after")
    def check_seniority(self) -> "JobListing":
        """Soft warn (not reject) if role looks junior."""
        if not SENIORITY_PATTERNS.search(self.role):
            # Lower score rather than reject — supervisor decides
            self.fit_score = max(0, self.fit_score - 2)
        return self

    def dedup_key(self) -> tuple[str, str, str]:
        """Canonical key for deduplication."""
        return (
            self.role.lower()[:50],
            self.company.lower()[:30],
            self.country.lower()[:20],
        )

    def to_sheet_row(self) -> list[str]:
        """Flat list for Google Sheets append_row()."""
        return [
            self.role,
            self.company,
            self.country,
            self.job_type.value,
            self.remote_scope.value,
            self.source_portal,
            str(self.date_found),
            self.urgency.value,
            str(self.fit_score) + "/10",
            self.status.value,
            self.salary_hint or "—",
            self.fit_notes or "—",
            self.link,
        ]

    @classmethod
    def sheet_headers(cls) -> list[str]:
        return [
            "Role / Position Title", "Company / Hiring Org", "Country",
            "Job Type", "Remote Scope", "Source Portal", "Date Found",
            "Urgency", "Fit Score", "Status", "Salary / Rate",
            "Fit Notes", "Direct Link",
        ]


# ══════════════════════════════════════════════════════════════════
# AGENT STATE — LangGraph TypedDict
# ══════════════════════════════════════════════════════════════════

from typing import TypedDict, Sequence
from langgraph.graph.message import add_messages


class AgentState(TypedDict, total=False):
    """Shared mutable state flowing through the LangGraph graph."""

    # Input
    user_profile:    dict                    # from config.json
    run_date:        str                     # ISO date string

    # Search node output
    raw_results:     list[dict]              # Tavily results (raw)

    # Parse node output
    parsed_jobs:     list[dict]              # Pydantic-validated dicts
    parse_errors:    list[str]               # rejection reasons

    # Rank node output
    ranked_jobs:     list[dict]              # scored + enriched
    skipped_low:     int                     # jobs scored < threshold

    # Writer node output
    new_jobs_added:  int
    dupes_skipped:   int
    sheet_url:       str

    # Supervisor reasoning
    messages:        Annotated[list, add_messages]
    retry_count:     int
    errors:          list[str]

    # Run report
    run_summary:     dict


# ══════════════════════════════════════════════════════════════════
# RUN REPORT
# ══════════════════════════════════════════════════════════════════

class RunReport(BaseModel):
    """Structured record written to logs/ after each run."""

    run_id:          str
    run_date:        date
    duration_secs:   float
    queries_run:     int
    raw_results:     int
    parsed_ok:       int
    parse_errors:    int
    ranked_jobs:     int
    new_added:       int
    dupes_skipped:   int
    low_score_skip:  int
    sheet_url:       str
    langsmith_url:   str = ""
    top_jobs:        list[str] = Field(default_factory=list)   # top 3 role titles
    errors:          list[str] = Field(default_factory=list)
