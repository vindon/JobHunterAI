"""
nodes.py — LangGraph node functions for JobHunterAI

Each function takes AgentState → returns partial AgentState update.
Nodes are pure functions: easy to test, easy to swap.

Pipeline:
  supervisor_plan → search → parse → rank → write → supervisor_report
"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import date
from typing import Any

# from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, SystemMessage

from agent.prompts import (
    parse_user_batch, rank_system, supervisor_system, summary_user, PARSE_SYSTEM,
)
from agent.schemas import (
    AgentState, JobListing, JobType, RemoteScope, UrgencyLevel,
    ApplicationStatus,
)
from agent.tools import (
    append_jobs_to_csv, get_csv_path, get_output_url,
    load_existing_keys, search_jobs_parallel,
)

log = logging.getLogger("JobHunterAI.nodes")

# ── Shared LLM client (Ollama — local, no API key needed) ──
def _get_llm():
    from langchain_ollama import ChatOllama
    import json
    try:
        with open("config/profile.json") as f:
            profile = json.load(f)
        model = profile.get("ollama_model", "qwen3.5:9b")
    except Exception:
        model = "qwen3.5:9b"
    return ChatOllama(
        model=model,
        temperature=0,
        num_predict=4096,
        think=False,        # disable Qwen3 extended thinking for clean JSON output
    )


# ══════════════════════════════════════════════════════════════════
# NODE 0 — SUPERVISOR PLAN
# Reasons about what to search for and sets up the run
# ══════════════════════════════════════════════════════════════════

def node_supervisor_plan(state: AgentState) -> dict:
    """
    ReAct reasoning step: Supervisor reviews the user profile
    and announces the plan before delegating to Search.
    """
    log.info("━━━  SUPERVISOR: Planning run  ━━━")
    profile = state.get("user_profile", {})

    llm = _get_llm()
    messages = [
        SystemMessage(content=supervisor_system(profile)),
        HumanMessage(content=(
            f"Today is {date.today().isoformat()}. "
            f"Plan the job search run. Confirm which queries you will run "
            f"and what you expect to find. Be brief."
        )),
    ]
    response = llm.invoke(messages)
    plan_text = response.content if hasattr(response, "content") else str(response)
    log.info(f"  Supervisor plan:\n{plan_text[:400]}...")

    return {
        "run_date": date.today().isoformat(),
        "retry_count": 0,
        "errors": [],
        "messages": [HumanMessage(content=f"Run plan: {plan_text}")],
    }


# ══════════════════════════════════════════════════════════════════
# NODE 1 — SEARCH
# Fires all Tavily queries, collects raw results
# ══════════════════════════════════════════════════════════════════

def node_search(state: AgentState) -> dict:
    """
    Run all configured search queries via Tavily.
    Results are filtered to last 7 days by Tavily's days= param.
    """
    log.info("━━━  SEARCH: Firing Tavily queries  ━━━")
    profile  = state.get("user_profile", {})
    queries  = profile.get("search_queries", [])

    if not queries:
        log.error("  No search queries configured!")
        return {"raw_results": [], "errors": ["No search queries found in profile"]}

    all_results = []
    query_results = search_jobs_parallel(queries, max_results=5)

    for query, results in query_results.items():
        for r in results:
            r["_source_query"] = query   # tag for parse node
        all_results.extend(results)

    log.info(f"  Total raw results: {len(all_results)} across {len(queries)} queries")

    # Retry logic: if < 5 results total, broaden and retry once
    if len(all_results) < 5:
        retry_count = state.get("retry_count", 0)
        if retry_count < 1:
            log.warning("  Fewer than 5 results — retrying with broader queries...")
            broad_queries = profile.get("broad_search_queries", queries[:3])
            extra = search_jobs_parallel(broad_queries, max_results=8)
            for q_results in extra.values():
                all_results.extend(q_results)
            return {
                "raw_results": all_results,
                "retry_count": retry_count + 1,
            }

    return {"raw_results": all_results}


# ══════════════════════════════════════════════════════════════════
# NODE 2 — PARSE
# Claude extracts + Pydantic validates each job from raw HTML snippets
# ══════════════════════════════════════════════════════════════════

def _extract_json_array(text: str) -> list[dict]:
    """Safely extract a JSON array from LLM response (handles Qwen3 think blocks)."""
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    text = re.sub(r"```(?:json)?", "", text).strip()
    # Try array first
    match = re.search(r"\[.*\]", text, re.DOTALL)
    if match:
        try:
            result = json.loads(match.group(0))
            if isinstance(result, list):
                return result
        except json.JSONDecodeError:
            pass
    # Fallback: single object — wrap in list
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            obj = json.loads(match.group(0))
            if isinstance(obj, dict):
                return [obj]
        except json.JSONDecodeError:
            pass
    return []


PARSE_BATCH = 15  # results per LLM call (55 results → 4 calls instead of 11)

_PORTAL_HINTS = [
    ("seek.com.au",      "SEEK AU"),
    ("nz.seek.com",      "SEEK NZ"),
    ("reed.co.uk",       "Reed UK"),
    ("linkedin.com",     "LinkedIn"),
    ("indeed.com",       "Indeed"),
    ("remoterocketship", "Remote Rocketship"),
    ("gartner.com",      "Gartner"),
]


_JOB_TYPE_MAP = {
    "permanent": "Full-time",
    "full time": "Full-time",
    "fulltime": "Full-time",
    "temp": "Contract",
    "temporary": "Contract",
    "project": "Contract",
    "freelance": "Part-time / Freelance",
    "part time": "Part-time / Freelance",
    "parttime": "Part-time / Freelance",
}

_REMOTE_SCOPE_MAP = {
    "fully remote":    "🌐 Remote",
    "fully-remote":    "🌐 Remote",
    "remote":          "🌐 Remote",
    "remote australia":"🌏 Anywhere in AU",
    "remote au":       "🌏 Anywhere in AU",
    "remote nz":       "🇳🇿 NZ Remote",
    "remote uk":       "🌐 Remote UK",
    "remote us":       "🌐 Remote US",
    "remote usa":      "🌐 Remote US",
    "globally remote": "🌍 Globally Remote",
    "global remote":   "🌍 Globally Remote",
    "work from anywhere": "🌍 Globally Remote",
}


def _normalise_job_dict(jd: dict) -> dict:
    """Remap field-name variations and coerce enum values that local LLMs commonly mangle."""
    # title → role
    if "role" not in jd and "title" in jd:
        jd["role"] = jd.pop("title")
    # url → link
    if "link" not in jd and "url" in jd:
        jd["link"] = jd.pop("url")
    # infer source_portal from link when missing
    if not jd.get("source_portal"):
        link = jd.get("link", "")
        for hint, label in _PORTAL_HINTS:
            if hint in link:
                jd["source_portal"] = label
                break
        else:
            jd["source_portal"] = "Web"
    # coerce job_type to valid enum value
    raw_jt = jd.get("job_type", "")
    jd["job_type"] = _JOB_TYPE_MAP.get(raw_jt.lower().strip(), raw_jt) or "Unknown"
    # coerce remote_scope to valid emoji enum value
    raw_rs = jd.get("remote_scope", "")
    jd["remote_scope"] = _REMOTE_SCOPE_MAP.get(raw_rs.lower().strip(), raw_rs) or "🌐 Remote"
    # drop invalid/empty urgency so Pydantic default (⚡ Active) applies
    valid_urgency = {"🔥 URGENT", "⚡ Active"}
    if jd.get("urgency") not in valid_urgency:
        jd.pop("urgency", None)
    # default country if missing
    if not jd.get("country"):
        jd["country"] = "Global"
    # default company if missing/empty
    if not jd.get("company") or len(jd["company"]) < 2:
        portal = jd.get("source_portal", "Web")
        jd["company"] = f"Via {portal}"
    return jd


def node_parse(state: AgentState) -> dict:
    """
    Extract structured job data in flat batches of PARSE_BATCH results per LLM call.
    """
    log.info("━━━  PARSE: Extracting + validating jobs  ━━━")
    raw_results = state.get("raw_results", [])
    if not raw_results:
        return {"parsed_jobs": [], "parse_errors": ["No raw results to parse"]}

    llm = _get_llm()
    batches = [raw_results[i:i + PARSE_BATCH] for i in range(0, len(raw_results), PARSE_BATCH)]

    parsed_jobs: list[dict] = []
    parse_errors: list[str] = []

    for i, batch in enumerate(batches, 1):
        log.info(f"  Parse batch {i}/{len(batches)} ({len(batch)} results)")
        messages = [
            SystemMessage(content=PARSE_SYSTEM),
            HumanMessage(content=parse_user_batch(batch)),
        ]
        try:
            response  = llm.invoke(messages)
            raw_text  = response.content if hasattr(response, "content") else str(response)
            job_dicts = _extract_json_array(raw_text)

            for jd in job_dicts:
                jd = _normalise_job_dict(jd)
                try:
                    job = JobListing(**jd)
                    parsed_jobs.append(job.model_dump())
                except Exception as ve:
                    err = f"Validation fail [{jd.get('role','?')}@{jd.get('company','?')}]: {ve}"
                    parse_errors.append(err)
                    log.debug(f"  {err}")

        except Exception as exc:
            err = f"Parse LLM call failed: {exc}"
            parse_errors.append(err)
            log.warning(f"  {err}")

    log.info(f"  Parsed: {len(parsed_jobs)} ok | {len(parse_errors)} errors")
    return {"parsed_jobs": parsed_jobs, "parse_errors": parse_errors}


# ══════════════════════════════════════════════════════════════════
# NODE 3 — RANK
# Claude scores each job 0-10 against the candidate profile
# ══════════════════════════════════════════════════════════════════

MIN_FIT_SCORE = 5   # Jobs below this are not written to the sheet

def node_rank(state: AgentState) -> dict:
    """
    Score each parsed job against the candidate profile.
    Discard jobs below MIN_FIT_SCORE.
    """
    log.info("━━━  RANK: Scoring jobs against profile  ━━━")
    parsed_jobs = state.get("parsed_jobs", [])
    profile     = state.get("user_profile", {})

    if not parsed_jobs:
        return {"ranked_jobs": [], "skipped_low": 0}

    llm  = _get_llm()
    BATCH = 10   # Score up to 10 jobs per Claude call

    ranked_jobs: list[dict] = []
    skipped_low = 0

    for i in range(0, len(parsed_jobs), BATCH):
        batch = parsed_jobs[i : i + BATCH]
        batch_simple = [
            {"role": j.get("role"), "company": j.get("company"),
             "country": j.get("country"), "job_type": j.get("job_type"),
             "remote_scope": j.get("remote_scope"),
             "raw_snippet": j.get("raw_snippet", "")[:200]}
            for j in batch
        ]

        messages = [
            SystemMessage(content=rank_system(profile)),
            HumanMessage(content=f"Score these jobs:\n{json.dumps(batch_simple, indent=2)}"),
        ]
        try:
            response   = llm.invoke(messages)
            raw_text   = response.content if hasattr(response, "content") else str(response)
            score_data = _extract_json_array(raw_text)

            # Merge scores back into job dicts
            score_map = {
                (s.get("role", "")[:40].lower(), s.get("company", "")[:30].lower()): s
                for s in score_data
            }
            for job in batch:
                key    = (job.get("role", "")[:40].lower(), job.get("company", "")[:30].lower())
                scores = score_map.get(key, {})
                job["fit_score"]  = scores.get("fit_score", job.get("fit_score", 0))
                job["fit_notes"]  = scores.get("fit_notes", job.get("fit_notes", ""))
                job["urgency"]    = scores.get("urgency", job.get("urgency", "⚡ Active"))

                if job["fit_score"] >= MIN_FIT_SCORE:
                    ranked_jobs.append(job)
                else:
                    skipped_low += 1
                    log.debug(f"  LOW SCORE {job['fit_score']}/10: {job.get('role')} @ {job.get('company')}")

        except Exception as exc:
            log.warning(f"  Rank batch failed: {exc}")
            # On failure, include all with default score so nothing is lost
            for job in batch:
                if job.get("fit_score", 0) >= MIN_FIT_SCORE:
                    ranked_jobs.append(job)

    # Sort by score descending
    ranked_jobs.sort(key=lambda j: j.get("fit_score", 0), reverse=True)
    log.info(f"  Ranked: {len(ranked_jobs)} above threshold | {skipped_low} skipped (score < {MIN_FIT_SCORE})")
    return {"ranked_jobs": ranked_jobs, "skipped_low": skipped_low}


# ══════════════════════════════════════════════════════════════════
# NODE 4 — WRITE
# Dedup against Google Sheet, append new rows, log the run
# ══════════════════════════════════════════════════════════════════

def node_write(state: AgentState) -> dict:
    """
    Deduplicate ranked jobs against the existing CSV,
    then append new rows to ~/Documents/JobHunterAI/jobs_tracker.csv.
    """
    log.info("━━━  WRITE: Saving to CSV  ━━━")
    ranked_jobs = state.get("ranked_jobs", [])
    csv_path    = get_csv_path()

    existing_keys = load_existing_keys(csv_path)
    new_rows: list[list[str]] = []
    dupes_skipped = 0

    for job_dict in ranked_jobs:
        try:
            job = JobListing(**_normalise_job_dict(job_dict))
            key = job.dedup_key()
            if key in existing_keys:
                dupes_skipped += 1
                log.debug(f"  DUPE: {job.role} @ {job.company}")
                continue
            new_rows.append(job.to_sheet_row())
            existing_keys.add(key)
            log.info(f"  ✅ NEW: {job.role} @ {job.company} [{job.country}] {job.fit_score}/10")
        except Exception as exc:
            log.warning(f"  Row build failed: {exc}")

    new_added = append_jobs_to_csv(new_rows)

    log.info(f"  Written: {new_added} new | {dupes_skipped} dupes skipped")
    return {
        "new_jobs_added": new_added,
        "dupes_skipped":  dupes_skipped,
        "sheet_url":      get_output_url(),
    }


# ══════════════════════════════════════════════════════════════════
# NODE 5 — SUPERVISOR REPORT
# Claude generates a human-readable run summary
# ══════════════════════════════════════════════════════════════════

def node_supervisor_report(state: AgentState) -> dict:
    """
    Final ReAct observation: Supervisor reviews what happened
    and produces a human-readable summary.
    """
    log.info("━━━  SUPERVISOR: Generating report  ━━━")

    ranked_jobs = state.get("ranked_jobs", [])
    top_5       = sorted(ranked_jobs, key=lambda j: j.get("fit_score", 0), reverse=True)[:5]

    stats = {
        "queries_run":   state.get("user_profile", {}).get("search_queries", []),
        "raw_count":     len(state.get("raw_results", [])),
        "parsed_ok":     len(state.get("parsed_jobs", [])),
        "ranked_count":  len(ranked_jobs),
        "new_added":     state.get("new_jobs_added", 0),
        "dupes":         state.get("dupes_skipped", 0),
        "threshold":     MIN_FIT_SCORE,
        "low_score":     state.get("skipped_low", 0),
        "errors":        state.get("errors", []) + state.get("parse_errors", []),
        "top_jobs_data": top_5,
    }
    stats["queries_run"] = len(stats["queries_run"])

    llm = _get_llm()
    messages = [HumanMessage(content=summary_user(stats))]
    response    = llm.invoke(messages)
    summary_txt = response.content if hasattr(response, "content") else str(response)

    run_summary = {
        "text":        summary_txt,
        "new_added":   state.get("new_jobs_added", 0),
        "sheet_url":   state.get("sheet_url", ""),
        "top_jobs":    [f"{j.get('role')} @ {j.get('company')}" for j in top_5],
    }

    log.info(f"\n{'═'*60}")
    log.info("  RUN SUMMARY")
    log.info(f"{'═'*60}")
    log.info(summary_txt)
    log.info(f"\n  📊 Sheet: {state.get('sheet_url', '')}")
    log.info(f"{'═'*60}\n")

    return {"run_summary": run_summary}
