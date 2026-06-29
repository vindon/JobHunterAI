# JobHunterAI — Product Requirements

## Problem Statement

Job searching is exhausting, fragmented, and demoralising — especially when you're unemployed.

A typical job seeker in 2026 must:
- Check 8–15 different job boards daily (SEEK, LinkedIn, Indeed, Reed, Remote.co, ...)
- Use different search syntax on every platform
- Manually filter hundreds of stale, irrelevant, or duplicate listings
- Track applications across spreadsheets, email folders, or paper
- Have no reliable way to know which jobs they're most qualified for

Remote-first roles are particularly scattered: a global remote role for an AI strategist may appear on SEEK AU, Reed UK, LinkedIn, Remote Rocketship, and a niche Gartner board — but never in one place.

**The result:** candidates spend 3–4 hours per day on search mechanics instead of applying and preparing.

**The core insight:** this is a solved problem for software — scraping, aggregation, ranking against a profile, and application tracking are all automatable. The only barrier was the cost and complexity of LLMs. With local models (Mistral via Ollama), the cost is zero.

---

## Target Users

**Primary:** People actively job hunting, especially:
- Unemployed or recently made redundant
- Targeting remote roles globally (not limited to one country)
- Senior/strategic roles in AI, technology, or digital transformation
- Not necessarily technical enough to build something like this themselves

**Secondary:** Technical job seekers who want to customise the queries and scoring for their own domain.

**Explicitly not targeted:**
- Recruiters or hiring companies (no employer-facing tools)
- People looking for local, in-office roles (remote-first by design)
- Enterprise HR departments

---

## Goals

1. **Aggregate** — search 11+ job boards in a single automated run, daily
2. **Score** — rank every listing against the user's specific skills, seniority, and target countries using AI
3. **Track** — maintain a Kanban board showing all discovered jobs and application progress
4. **Privacy** — user profile and job data never leave the user's machine
5. **Free** — no subscription fees, no per-token costs for core functionality
6. **Low friction** — a non-technical user should be able to set it up in under 30 minutes

---

## Non-Goals

- Social features (sharing jobs, following other users)
- Employer-facing tools (posting jobs, ATS integration)
- Email/calendar integration (out of scope for v1)
- Mobile app (desktop web only)
- Resume parsing or auto-application submission
- Public cloud deployment (runs locally by design)

---

## Functional Requirements

### Search and Ingestion

**FR-001 — Multi-board search**
The agent SHALL execute all configured search queries against Tavily's web search API, which aggregates SEEK AU, SEEK NZ, Reed UK, Indeed US/UK, LinkedIn, Remote Rocketship, Gartner, and other boards based on `site:` query operators.

**FR-002 — Freshness filter**
Every search query SHALL use Tavily's `days=7` parameter to restrict results to the last 7 days. The agent SHALL NOT surface stale listings.

**FR-003 — Retry on thin results**
If total raw results across all queries are fewer than 5 AND this is the first attempt, the agent SHALL retry with `broad_search_queries` from the profile before proceeding to parse.

**FR-004 — Query configurability**
Search queries SHALL be configurable per-user in `config/profile.json` with no code changes required.

**FR-005 — Parallel query support**
The system SHALL support at least 20 simultaneous search queries. (Current implementation is sequential with 0.5s delay due to Tavily free-tier limits; this may be parallelised with a paid key.)

### Parsing and Validation

**FR-006 — Structured extraction**
The parse node SHALL extract at minimum: role title, company, country, job type, remote scope, source portal, apply URL, salary hint (if available), and a raw snippet from each Tavily result.

**FR-007 — Schema validation**
Every extracted job SHALL be validated against the `JobListing` Pydantic v2 model before entering the ranked pipeline. Invalid jobs SHALL be logged to `parse_errors` in state, not silently dropped.

**FR-008 — Spam rejection**
Jobs matching the `SPAM_PATTERNS` regex (MLM, casino, binary options, adult content, etc.) SHALL be rejected at validation time with a clear error message.

**FR-009 — Deduplication**
The write node SHALL deduplicate against all previously saved jobs using a case-insensitive `(role[:50], company[:30], country[:20])` key. Duplicate jobs SHALL be counted but not re-written.

**FR-010 — Manual job entry**
The CLI SHALL support `python main.py add <role> <company> <country> <url>` to allow users to add jobs they found manually. These jobs SHALL go through the same Pydantic validation and dedup check.

### Scoring and Ranking

**FR-011 — Fit scoring**
The rank node SHALL score each validated job 0–10 using the local LLM, comparing the job against the user's `target_roles`, `key_skills`, `min_seniority`, and `target_countries`.

**FR-012 — Fit notes**
Each scored job SHALL include a 1–2 sentence `fit_notes` field explaining the score in plain English.

**FR-013 — Score threshold**
Jobs scoring below `fit_score_threshold` (default: 5) SHALL NOT be written to the tracker. The count of discarded jobs SHALL be reported in the run summary.

**FR-014 — Seniority adjustment**
Jobs without senior-level keywords in the title SHALL receive a -2 penalty to their fit score via the `check_seniority` Pydantic model validator.

**FR-015 — Urgency flagging**
Jobs explicitly marked as urgent (keywords: "immediate", "urgent", "asap", "immediate start") SHALL be flagged with the `🔥 URGENT` urgency level.

### Output and Storage

**FR-016 — CSV output**
All jobs scoring above threshold SHALL be appended to `~/Documents/JobHunterAI/jobs_tracker.csv` with 13 columns: Role, Company, Country, Job Type, Remote Scope, Source Portal, Date Found, Urgency, Fit Score, Status, Salary/Rate, Fit Notes, Direct Link.

**FR-017 — Run logging**
Every run SHALL append a record to `~/Documents/JobHunterAI/run_log.csv` with: run date, new jobs added, total jobs in tracker, queries run, duration in seconds, summary text.

**FR-018 — JSON run report**
Every run SHALL produce a structured JSON report at `logs/run_YYYY-MM-DD_<run_id>.json` conforming to the `RunReport` Pydantic model.

**FR-019 — Dry-run mode**
The CLI `--dry-run` flag SHALL complete the full search, parse, and rank pipeline WITHOUT writing to any CSV files. Log output SHALL indicate dry-run mode.

### Web UI

**FR-020 — Dashboard**
The web UI SHALL display: total jobs in tracker, jobs by status (New/Applied/Interview/Offer), average fit score, score distribution chart, recent run history, and top 5 jobs from the last run.

**FR-021 — Jobs Board table view**
The web UI SHALL display all jobs in a sortable, filterable table with columns: Role, Company, Country, Job Type, Remote Scope, Fit Score, Status, Date Found, and a link to apply.

**FR-022 — Jobs Board Kanban view**
The web UI SHALL provide a drag-and-drop Kanban board with columns: New, Reviewing, Applied, Interview, Offer, Pass. Dragging a card SHALL update the job's status via the API.

**FR-023 — Job filters**
The Jobs Board SHALL support filtering by: country, job type, remote scope, fit score range (slider), status, and free-text search across role and company.

**FR-024 — Run Agent page**
The web UI SHALL have a "Run Agent" page with: a button to start a new run, a live pipeline visualiser showing which node is currently active, a streaming log output panel, and a results panel where new jobs appear in real time.

**FR-025 — SSE streaming**
When a run is in progress, the UI SHALL consume a Server-Sent Events stream from `/api/runs/stream/{run_id}` to display log lines, new job discoveries, and final run stats without polling.

### Scheduling

**FR-026 — macOS launchd scheduling**
The CLI `python main.py schedule` SHALL print step-by-step instructions and a ready-to-use `launchd` plist for scheduling daily automated runs.

### Observability

**FR-027 — LangSmith integration**
If `LANGCHAIN_API_KEY` is set in the environment, the agent SHALL automatically enable LangSmith tracing via `LANGCHAIN_TRACING_V2=true`. All nodes, LLM calls, and state transitions SHALL appear in the LangSmith project dashboard.

---

## Non-Functional Requirements

**NFR-001 — Search performance**
The search node SHALL complete all configured queries in under 60 seconds for up to 20 queries on a standard broadband connection.

**NFR-002 — Full run performance**
A complete agent run (plan → search → parse → rank → write → report) for 11 queries and up to 55 raw results SHALL complete in under 10 minutes on Apple Silicon M-series hardware with Mistral 7B via Ollama.

**NFR-003 — LLM-free path**
The search, dedup, write, and log operations SHALL NOT require any LLM calls and SHALL complete in under 30 seconds total.

**NFR-004 — Security — local-only**
The web application SHALL NOT be accessible from outside `localhost`. The FastAPI CORS configuration SHALL restrict origins to `http://localhost:3000`.

**NFR-005 — Security — no PII leakage**
User profile details (name, email, skills) SHALL NOT be logged to disk outside of `config/profile.json`. They SHALL appear in LLM prompts (and therefore LangSmith traces if enabled) only when the user has explicitly configured LangSmith.

**NFR-006 — Availability**
As a local-only tool, the system has no uptime SLA. It SHOULD be resilient to transient Tavily API failures via the built-in retry logic. It SHOULD be resilient to LLM batch failures by including unscored jobs rather than crashing.

**NFR-007 — Usability — setup time**
A non-technical user following the README SHALL be able to complete setup and execute their first run in under 30 minutes on a modern macOS machine.

**NFR-008 — Usability — accessibility**
The web UI SHALL meet WCAG AA standards for colour contrast and keyboard navigation at 1280px+ viewport widths.

**NFR-009 — Usability — responsive**
The web UI SHALL be fully usable at 1280px+ width. Mobile layout is out of scope for v1 but SHALL NOT be actively broken (no horizontal overflow).

**NFR-010 — Cost — free default path**
The default configuration (Ollama/Mistral + Tavily free tier) SHALL incur zero ongoing monetary cost. The Tavily free tier (1,000 searches/month) SHALL be sufficient for at least 30 daily runs per month.

---

## Data Requirements

### Job data model

All stored jobs conform to the `JobListing` Pydantic model:

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `role` | string | Yes | 4–120 chars, spam-free |
| `company` | string | Yes | 2–100 chars |
| `country` | string | Yes | 2–60 chars |
| `job_type` | enum | No | Full-time / Contract / Part-time / Fractional / Unknown |
| `remote_scope` | enum | No | 7 valid values (see schemas.py) |
| `urgency` | enum | No | Active / URGENT |
| `source_portal` | string | Yes | 2–60 chars |
| `link` | string | Yes | Valid URL, min 10 chars |
| `date_found` | date | No | Defaults to today |
| `fit_score` | integer | No | 0–10 |
| `fit_notes` | string | No | Max 400 chars |
| `salary_hint` | string | No | Max 80 chars |
| `status` | enum | No | New/Reviewing/Applied/Interview/Offer/Pass |

### Retention policy

- Jobs tracker CSV: retained indefinitely (no automatic pruning)
- Run logs JSON: retained indefinitely
- Run log CSV: retained indefinitely
- LangSmith traces: subject to LangSmith's retention policy (free tier: 14 days)

### Export formats

- CSV (current) — all jobs in `~/Documents/JobHunterAI/jobs_tracker.csv`
- JSON — per-run reports in `logs/`
- Future: Excel export, PDF summary report

---

## API Requirements

See `docs/API.md` for the full REST and SSE specification.

Summary of endpoints:

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Health check |
| GET | /api/jobs | List jobs (paginated, filterable) |
| GET | /api/jobs/{id} | Single job |
| PATCH | /api/jobs/{id} | Update job status |
| GET | /api/jobs/stats | Aggregate stats for dashboard |
| POST | /api/runs/start | Start agent run |
| GET | /api/runs/stream/{run_id} | SSE — live run events |
| GET | /api/runs/history | Past runs |
| GET | /api/profile | Read profile.json |
| PATCH | /api/profile | Write profile.json |
| GET | /api/settings | Read agent settings |
| PATCH | /api/settings | Write agent settings |
| GET | /api/settings/queries | List search queries |
| POST | /api/settings/queries | Add search query |
| DELETE | /api/settings/queries/{idx} | Remove search query |

---

## UI Requirements

### Design system

See `docs/DESIGN.md` for full design system specification.

### Pages required

| Page | Route | Description |
|------|-------|-------------|
| Dashboard | `/` | Overview: stats, recent runs, score chart |
| Jobs Board | `/jobs` | Full job list: table view + kanban view |
| Run Agent | `/run` | Start run, live pipeline, streaming logs |
| Settings | `/settings` | Edit profile.json and search queries |

### Warm design language

The UI SHALL use a warm, human-first colour palette (terracotta, cream, warm greys) rather than cold tech blues. The rationale: job hunting is an emotionally charged experience; the tool should feel supportive, not clinical.

---

## Integration Requirements

### Tavily API

- **Required:** Yes (free tier sufficient)
- **Usage:** Web search with multi-site targeting and freshness filters
- **Rate limit:** Free tier allows ~1,000 searches/month; the agent uses 11 per run
- **Failure handling:** Each query retries once on transient failure (2s delay); failed queries are counted in `parse_errors`

### Ollama

- **Required:** Yes for parse and rank nodes
- **Default model:** `mistral:7b` (configurable)
- **Failure handling:** If Ollama is unreachable, the agent fails at the first LLM node with a clear error message
- **Fallback:** Configurable to any Ollama-compatible model; Claude API is an optional fallback with `ANTHROPIC_API_KEY`

### LangSmith

- **Required:** No (optional observability)
- **Usage:** Full trace of every LangGraph node, LLM call, and state transition
- **Data sensitivity:** Prompts (containing profile details) are sent to LangSmith when enabled
