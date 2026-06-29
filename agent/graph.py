"""
graph.py — LangGraph state machine for JobHunterAI

Defines the directed graph:

  supervisor_plan
       │
     search ──── (retry edge if < 5 results and retry_count < 1)
       │
     parse
       │
     rank
       │
     write
       │
  supervisor_report ──► END

LangSmith tracing is enabled via environment variables.
"""

from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import date
from pathlib import Path

from langgraph.graph import StateGraph, END

from agent.nodes import (
    node_parse,
    node_rank,
    node_search,
    node_supervisor_plan,
    node_supervisor_report,
    node_write,
)
from agent.schemas import AgentState, RunReport
from agent.tools import log_run_to_csv, get_output_url

log = logging.getLogger("JobHunterAI.graph")


# ══════════════════════════════════════════════════════════════════
# CONDITIONAL EDGE — retry search if results too thin
# ══════════════════════════════════════════════════════════════════

def should_retry_search(state: AgentState) -> str:
    """
    After search: if we have < 5 raw results and haven't retried yet,
    go back to search. Otherwise proceed to parse.
    """
    raw     = state.get("raw_results", [])
    retries = state.get("retry_count", 0)
    if len(raw) < 5 and retries < 1:
        log.info("  → Routing: retry search (too few results)")
        return "search"     # loop back
    return "parse"


def should_continue_after_parse(state: AgentState) -> str:
    """
    After parse: if nothing was parsed at all, skip to report.
    Otherwise proceed to rank.
    """
    if not state.get("parsed_jobs"):
        log.warning("  → Routing: no parsed jobs — skipping to report")
        return "report"
    return "rank"


def should_continue_after_rank(state: AgentState) -> str:
    """
    After rank: always write, even if 0 jobs above threshold
    (the write node handles the empty-list case gracefully).
    """
    return "write"


# ══════════════════════════════════════════════════════════════════
# GRAPH BUILDER
# ══════════════════════════════════════════════════════════════════

def build_graph() -> StateGraph:
    """Compile the LangGraph state machine."""

    builder = StateGraph(AgentState)

    # ── Add nodes ────────────────────────────────────────────────
    builder.add_node("plan",   node_supervisor_plan)
    builder.add_node("search", node_search)
    builder.add_node("parse",  node_parse)
    builder.add_node("rank",   node_rank)
    builder.add_node("write",  node_write)
    builder.add_node("report", node_supervisor_report)

    # ── Entry point ───────────────────────────────────────────────
    builder.set_entry_point("plan")

    # ── Static edges ──────────────────────────────────────────────
    builder.add_edge("plan",   "search")
    builder.add_edge("rank",   "write")
    builder.add_edge("write",  "report")
    builder.add_edge("report", END)

    # ── Conditional edges (ReAct routing) ────────────────────────
    builder.add_conditional_edges(
        "search",
        should_retry_search,
        {"search": "search", "parse": "parse"},
    )
    builder.add_conditional_edges(
        "parse",
        should_continue_after_parse,
        {"rank": "rank", "report": "report"},
    )

    return builder.compile()


# ══════════════════════════════════════════════════════════════════
# RUN ENTRYPOINT
# ══════════════════════════════════════════════════════════════════

def run_agent(config_path: str = "config/profile.json") -> RunReport:
    """
    Load user profile, run the LangGraph agent, write report.
    This is the function called by main.py (and by launchd daily).
    """
    # ── Setup LangSmith tracing ──────────────────────────────────
    _configure_langsmith()

    # ── Load profile ─────────────────────────────────────────────
    profile = _load_profile(config_path)

    # ── Build + run graph ─────────────────────────────────────────
    graph    = build_graph()
    run_id   = str(uuid.uuid4())[:8]
    start_ts = time.time()

    log.info(f"\n{'═'*60}")
    log.info(f"  JobHunterAI  |  Run ID: {run_id}  |  {date.today()}")
    log.info(f"  Profile: {profile.get('name', 'Candidate')}")
    log.info(f"  Queries: {len(profile.get('search_queries', []))}")
    log.info(f"{'═'*60}")

    initial_state: AgentState = {
        "user_profile": profile,
        "run_date":     date.today().isoformat(),
        "messages":     [],
        "retry_count":  0,
        "errors":       [],
    }

    try:
        final_state = graph.invoke(initial_state)
    except Exception as exc:
        log.error(f"Graph execution failed: {exc}")
        final_state = {**initial_state, "errors": [str(exc)]}

    duration = time.time() - start_ts

    # ── Write run log to CSV ──────────────────────────────────────
    try:
        log_run_to_csv(
            run_date=date.today().isoformat(),
            new_jobs=final_state.get("new_jobs_added", 0),
            queries_run=len(profile.get("search_queries", [])),
            duration_secs=duration,
            notes=final_state.get("run_summary", {}).get("text", "")[:200],
        )
    except Exception as exc:
        log.warning(f"Run log write failed: {exc}")

    # ── Build + save run report ───────────────────────────────────
    ranked = final_state.get("ranked_jobs", [])
    report = RunReport(
        run_id         = run_id,
        run_date       = date.today(),
        duration_secs  = duration,
        queries_run    = len(profile.get("search_queries", [])),
        raw_results    = len(final_state.get("raw_results", [])),
        parsed_ok      = len(final_state.get("parsed_jobs", [])),
        parse_errors   = len(final_state.get("parse_errors", [])),
        ranked_jobs    = len(ranked),
        new_added      = final_state.get("new_jobs_added", 0),
        dupes_skipped  = final_state.get("dupes_skipped", 0),
        low_score_skip = final_state.get("skipped_low", 0),
        sheet_url      = final_state.get("sheet_url", get_output_url()),
        langsmith_url  = _langsmith_run_url(),
        top_jobs       = [
            f"{j.get('role')} @ {j.get('company')}"
            for j in sorted(ranked, key=lambda x: x.get("fit_score", 0), reverse=True)[:5]
        ],
        errors         = final_state.get("errors", []) + final_state.get("parse_errors", []),
    )

    _save_report(report, run_id)
    return report


# ══════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════

def _configure_langsmith() -> None:
    """Enable LangSmith tracing if API key is present."""
    key = os.environ.get("LANGCHAIN_API_KEY", "").strip()
    if key:
        os.environ["LANGCHAIN_TRACING_V2"]  = "true"
        os.environ["LANGCHAIN_PROJECT"]      = os.environ.get(
            "LANGCHAIN_PROJECT", "JobHunterAI"
        )
        os.environ["LANGCHAIN_ENDPOINT"]     = "https://api.smith.langchain.com"
        log.info("  LangSmith tracing: ENABLED ✅")
    else:
        log.info("  LangSmith tracing: DISABLED (no LANGCHAIN_API_KEY)")


def _langsmith_run_url() -> str:
    """Return LangSmith project URL if available."""
    key     = os.environ.get("LANGCHAIN_API_KEY", "")
    project = os.environ.get("LANGCHAIN_PROJECT", "JobHunterAI")
    if key:
        return f"https://smith.langchain.com/o/default/projects/{project}"
    return ""


def _load_profile(config_path: str) -> dict:
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(
            f"Profile not found: {config_path}\n"
            f"Copy config/profile.example.json → {config_path} and fill it in."
        )
    with open(path) as f:
        return json.load(f)


def _save_report(report: RunReport, run_id: str) -> None:
    """Save structured JSON report to logs/."""
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    out_path = log_dir / f"run_{date.today().isoformat()}_{run_id}.json"
    with open(out_path, "w") as f:
        f.write(report.model_dump_json(indent=2))
    log.info(f"  Report saved: {out_path}")
