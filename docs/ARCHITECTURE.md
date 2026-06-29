# JobHunterAI — Architecture

## System Overview

JobHunterAI is a multi-layer system. The agent core (Python/LangGraph) is fully built and production-ready. The web layer (FastAPI + Next.js) is in active development and streams real-time agent output to the browser.

```
┌──────────────────────────────────────────────────────────────────────┐
│                         USER'S MACHINE (local only)                  │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Browser  (http://localhost:3000)                           │    │
│  │                                                             │    │
│  │  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐ │    │
│  │  │  Dashboard  │  │  Jobs Board  │  │  Run Agent        │ │    │
│  │  │  (stats)    │  │  table+kanban│  │  pipeline + logs  │ │    │
│  │  └─────────────┘  └──────────────┘  └───────────────────┘ │    │
│  └───────────────────────────┬─────────────────────────────────┘    │
│                              │ HTTP / SSE                            │
│  ┌───────────────────────────▼─────────────────────────────────┐    │
│  │  FastAPI  (http://localhost:8000)                           │    │
│  │                                                             │    │
│  │  GET /api/jobs    POST /api/runs/start                      │    │
│  │  GET /api/runs/stream/{id}  (SSE)                           │    │
│  │  GET /api/profile  PATCH /api/settings                      │    │
│  │                                                             │    │
│  │  ┌──────────────────┐  ┌────────────────────────────────┐  │    │
│  │  │  SQLite (SQLModel│  │  SSE broadcaster               │  │    │
│  │  │  ORM)            │  │  (asyncio queue per run)       │  │    │
│  │  └──────────────────┘  └────────────────────────────────┘  │    │
│  └───────────────────────────┬─────────────────────────────────┘    │
│                              │ run_agent()                           │
│  ┌───────────────────────────▼─────────────────────────────────┐    │
│  │  LangGraph Agent  (agent/)                                  │    │
│  │                                                             │    │
│  │  supervisor_plan → search → parse → rank → write → report   │    │
│  │                      ↑                                      │    │
│  │                   (retry)                                   │    │
│  └──────────┬───────────────────────┬────────────────────────--┘    │
│             │                       │                                │
│  ┌──────────▼──────────┐  ┌─────────▼──────────────────────────┐   │
│  │  Tavily API         │  │  Ollama  (http://localhost:11434)   │   │
│  │  (external HTTPS)   │  │  Mistral 7B — runs fully locally    │   │
│  │  Web search         │  │  parse + rank nodes                 │   │
│  └─────────────────────┘  └────────────────────────────────────┘   │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Output                                                     │    │
│  │  ~/Documents/JobHunterAI/jobs_tracker.csv                  │    │
│  │  ~/Documents/JobHunterAI/run_log.csv                       │    │
│  │  logs/run_YYYY-MM-DD_<id>.json                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────┘
                                    │
                          (optional, external)
                                    │
                    ┌───────────────▼──────────────┐
                    │  LangSmith                   │
                    │  smith.langchain.com         │
                    │  Trace viewer + run history  │
                    └──────────────────────────────┘
```

---

## LangGraph Pipeline

The agent is a `StateGraph` compiled from `agent/graph.py`. It shares a single `AgentState` TypedDict across all nodes. Each node receives the full state and returns a partial update.

### Graph structure

```
supervisor_plan (plan)
        │
        ▼
     search ──────────────────────────────────┐
        │                                     │
        │  should_retry_search()              │
        │  if raw_results < 5 and retries < 1 │
        │  → loop back to search              │
        ▼                                     │
      parse  ◄────────────────────────────────┘
        │
        │  should_continue_after_parse()
        │  if parsed_jobs == []
        │  → skip to report
        ▼
      rank
        │
        ▼
      write
        │
        ▼
     report
        │
        ▼
       END
```

### NODE 0 — supervisor_plan

**File:** `agent/nodes.py` → `node_supervisor_plan()`

**Purpose:** ReAct planning step. The local LLM reads the user profile and announces what it will search for and why. Sets up run metadata.

**Inputs (from state):** `user_profile`

**Outputs (to state):** `run_date`, `retry_count = 0`, `errors = []`, `messages` (with plan text)

**LLM call:** Yes — Ollama/Mistral, `supervisor_system(profile)` prompt. Temperature 0. Used for reasoning transparency, not decision-making.

**Key behaviour:** If the model returns an unusable response the node still completes — the text is informational only.

---

### NODE 1 — search

**File:** `agent/nodes.py` → `node_search()`

**Purpose:** Execute all search queries via the Tavily API. Tag each result with its source query.

**Inputs (from state):** `user_profile.search_queries`, `retry_count`

**Outputs (to state):** `raw_results` (list of Tavily result dicts), `retry_count`

**LLM call:** No — purely deterministic Tavily API calls.

**Key behaviour:**
- Queries run sequentially with a 0.5s delay (Tavily free-tier rate limit protection)
- Each query uses `days=7` parameter — Tavily enforces freshness at the source
- Each result dict is tagged with `_source_query` for traceability in the parse node
- If total results < 5 AND retry_count < 1: the conditional edge `should_retry_search()` routes back to this node with `broad_search_queries` from the profile

**Retry edge logic (in `graph.py`):**
```python
def should_retry_search(state):
    if len(state["raw_results"]) < 5 and state["retry_count"] < 1:
        return "search"   # loop back once
    return "parse"
```

---

### NODE 2 — parse

**File:** `agent/nodes.py` → `node_parse()`

**Purpose:** Extract structured job data from raw Tavily result text. Validate every extracted job with Pydantic v2.

**Inputs (from state):** `raw_results`

**Outputs (to state):** `parsed_jobs` (list of valid job dicts), `parse_errors` (list of rejection reasons)

**LLM call:** Yes — Ollama/Mistral, `PARSE_SYSTEM` prompt. Batches of 15 results per call to reduce token round-trips.

**Key behaviour:**
1. Raw results are batched in groups of `PARSE_BATCH = 15`
2. Each batch produces a JSON array from the LLM — `_extract_json_array()` handles malformed output, strips `<think>` blocks (Qwen3 style), and falls back to single-object wrapping
3. `_normalise_job_dict()` remaps field aliases (e.g. `"title"` → `"role"`, `"url"` → `"link"`) and coerces enum strings to valid `JobType`/`RemoteScope` values
4. Each normalised dict is passed through `JobListing(**jd)` — Pydantic validation; failures produce entries in `parse_errors`
5. The `check_seniority` model validator applies a `-2` score penalty to roles that don't match senior-level patterns

**Pydantic validators in `JobListing`:**
- `strip_whitespace` — collapses multi-space in role and company
- `reject_spam_roles` — regex against known spam patterns (MLM, casino, etc.)
- `normalise_link` — ensures link starts with `https://`
- `coerce_score` — clamps fit_score to 0–10
- `check_seniority` — model-level validator applying seniority penalty

**Skip edge:** If `parsed_jobs` is empty after all batches, `should_continue_after_parse()` routes directly to `report`, skipping rank and write.

---

### NODE 3 — rank

**File:** `agent/nodes.py` → `node_rank()`

**Purpose:** Score every parsed job 0–10 against the candidate profile. Discard jobs below `MIN_FIT_SCORE`.

**Inputs (from state):** `parsed_jobs`, `user_profile`

**Outputs (to state):** `ranked_jobs` (scored, sorted desc), `skipped_low` (count of discarded jobs)

**LLM call:** Yes — Ollama/Mistral, `rank_system(profile)` prompt. Batches of 10 jobs per call.

**Key behaviour:**
1. Each batch sends only `role`, `company`, `country`, `job_type`, `remote_scope`, and a 200-char `raw_snippet` to the LLM — minimal context, fast scoring
2. Scores are matched back to job dicts by `(role[:40].lower(), company[:30].lower())` key
3. Jobs with `fit_score >= MIN_FIT_SCORE` (default: 5) are kept; others are counted in `skipped_low`
4. Final list is sorted descending by `fit_score`
5. On LLM batch failure: all jobs in the failing batch are included at their existing (default 0) score — no data is silently lost

**Threshold:** `MIN_FIT_SCORE = 5` (hardcoded in `nodes.py`; also configurable via `profile.json:fit_score_threshold`, though the constant takes precedence for the filter — this is a known inconsistency to resolve).

---

### NODE 4 — write

**File:** `agent/nodes.py` → `node_write()`

**Purpose:** Deduplicate ranked jobs against the existing CSV. Append new rows.

**Inputs (from state):** `ranked_jobs`

**Outputs (to state):** `new_jobs_added`, `dupes_skipped`, `sheet_url`

**LLM call:** No — pure I/O.

**Key behaviour:**
1. `load_existing_keys()` reads the master CSV and builds a `set` of `(role[:50].lower(), company[:30].lower(), country[:20].lower())` tuples
2. Each ranked job is checked against this set — duplicates are counted and skipped silently
3. New jobs call `job.to_sheet_row()` to produce a flat 13-column list matching `CSV_HEADERS`
4. `append_jobs_to_csv()` opens the file in append mode (creates with headers if new) and writes all new rows at once
5. The `JOBHUNTERAI_DRY_RUN=1` env var is respected by skipping the actual append

**Dedup key fields:** Role (first 50 chars), Company (first 30 chars), Country (first 20 chars). Case-insensitive. Enough to prevent true duplicates while allowing the same company in different countries.

**Output files:**
- `~/Documents/JobHunterAI/jobs_tracker.csv` — master job list (13 columns)
- `~/Documents/JobHunterAI/run_log.csv` — per-run summary (6 columns)

---

### NODE 5 — supervisor_report

**File:** `agent/nodes.py` → `node_supervisor_report()`

**Purpose:** ReAct observation step. The LLM generates a human-readable summary of what the run found, then the run stats are assembled into a `RunReport`.

**Inputs (from state):** all prior state fields

**Outputs (to state):** `run_summary` dict with `text`, `new_added`, `sheet_url`, `top_jobs`

**LLM call:** Yes — Ollama/Mistral, `summary_user(stats)` prompt. Single call, ~200 token output.

**Post-node (in `graph.py`):** `_save_report()` writes a structured JSON report to `logs/run_YYYY-MM-DD_<run_id>.json` as a `RunReport` Pydantic model.

---

## Data Flow

```
config/profile.json
        │
        │ _load_profile()
        ▼
    AgentState (initial)
    {user_profile, run_date, messages: [], retry_count: 0, errors: []}
        │
        │ node_supervisor_plan()
        ▼
    AgentState + {messages: [plan_text]}
        │
        │ node_search()
        ▼
    AgentState + {raw_results: [...Tavily dicts]}
        │
        │ node_parse() — LLM batch extraction + Pydantic validation
        ▼
    AgentState + {parsed_jobs: [...validated dicts], parse_errors: [...]}
        │
        │ node_rank() — LLM scoring, filter < MIN_FIT_SCORE
        ▼
    AgentState + {ranked_jobs: [...scored dicts, sorted], skipped_low: N}
        │
        │ node_write() — CSV dedup + append
        ▼
    AgentState + {new_jobs_added: N, dupes_skipped: M, sheet_url: path}
        │
        │ node_supervisor_report() — LLM summary + save RunReport
        ▼
    AgentState + {run_summary: {text, top_jobs, ...}}
        │
       END
        │
        │ graph.py post-processing
        ▼
    logs/run_YYYY-MM-DD_<id>.json  (RunReport)
    ~/Documents/JobHunterAI/jobs_tracker.csv  (new rows appended)
    ~/Documents/JobHunterAI/run_log.csv  (run record appended)
```

---

## FastAPI Backend

> **Status:** Planned. The agent runs standalone today via `main.py`. The FastAPI layer wraps it for the web UI.

### Design principles

- **Thin wrapper** — FastAPI does not re-implement agent logic; it calls `run_agent()` in a background thread and streams its log output via SSE
- **SQLite for persistence** — SQLModel ORM manages a local SQLite database for jobs and run history. The CSV remains the primary output; SQLite is the query layer for the UI
- **SSE for streaming** — each `/api/runs/stream/{run_id}` connection gets an asyncio queue; the background thread posts events (log lines, new job found, run complete) to the queue; the SSE endpoint consumes it
- **No auth** — local-only, no authentication required

### Planned routes

```
GET    /health
GET    /api/jobs                    # paginated, filterable
GET    /api/jobs/{id}
GET    /api/jobs/stats              # score histogram, country breakdown
POST   /api/runs/start              # kicks off agent in background
GET    /api/runs/stream/{run_id}    # SSE — live log + job events
GET    /api/runs/history
GET    /api/profile
PATCH  /api/profile
GET    /api/settings
PATCH  /api/settings
GET    /api/settings/queries        # search query management
POST   /api/settings/queries
DELETE /api/settings/queries/{idx}
```

See `docs/API.md` for full specifications.

### SSE streaming design

```python
# Conceptual — not yet implemented
class RunEventBus:
    queues: dict[str, asyncio.Queue]  # run_id → queue

    def emit(self, run_id, event_type, payload):
        # put_nowait into all subscribers
        ...

    async def subscribe(self, run_id):
        # async generator — yield SSE-formatted events
        ...
```

Event types: `log` (plain text line), `job` (new job dict), `progress` (node name + status), `complete` (final stats), `error` (error message).

---

## Frontend Architecture

> **Status:** Skeleton only. Next.js 16 with App Router is scaffolded in `web/`.

### Page structure

```
web/app/
├── layout.tsx          # Root layout: fonts (Plus Jakarta Sans, Inter, JetBrains Mono),
│                       # TanStack Query provider, Zustand store init
├── page.tsx            # / → Dashboard
├── jobs/
│   └── page.tsx        # /jobs → Jobs Board (table ↔ kanban toggle)
└── run/
    └── page.tsx        # /run → Run Agent (3-panel: pipeline | logs | results)
```

### Component hierarchy

```
Dashboard (app/page.tsx)
└── StatsGrid
    ├── StatCard (New this week)
    ├── StatCard (Applied)
    ├── StatCard (Interviews)
    └── StatCard (Avg Fit Score)
└── RecentJobs
└── RunHistory
└── ScoreDistribution (Recharts bar chart)

Jobs Board (app/jobs/page.tsx)
├── FilterBar (country, job type, score range, search)
├── ViewToggle (table | kanban)
├── JobTable (TanStack Table)
│   └── JobRow → FitScoreRing + StatusBadge
└── KanbanBoard (dnd-kit)
    ├── KanbanColumn (New | Reviewing | Applied | Interview | Offer | Pass)
    └── KanbanCard (draggable)

Run Agent (app/run/page.tsx)
├── PipelineVisualiser (6 node boxes, animated active state)
├── LogStream (SSE consumer, auto-scroll, JetBrains Mono)
└── LiveResults (job cards appear as SSE emits them)
```

### State management

- **TanStack Query** — server state: jobs list, run history, profile, stats. Handles caching, background refetch, and optimistic updates for status changes
- **Zustand** — client state: active filters, view mode (table/kanban), sidebar open/closed, current run ID, SSE connection status
- **SSE** — native `EventSource` in a custom React hook `useRunStream(runId)` that feeds into the Zustand run state

---

## SQLite Schema

> Managed by SQLModel (SQLAlchemy-based ORM). Database file: `~/.local/share/jobhunterai/db.sqlite` or `OUTPUT_DIR/db.sqlite`.

### Job table

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `role` | TEXT | Job title |
| `company` | TEXT | |
| `country` | TEXT | |
| `job_type` | TEXT | Full-time / Contract / etc. |
| `remote_scope` | TEXT | Emoji enum |
| `source_portal` | TEXT | SEEK AU / Reed UK / etc. |
| `date_found` | DATE | ISO date |
| `urgency` | TEXT | Emoji enum |
| `fit_score` | INTEGER | 0–10 |
| `fit_notes` | TEXT | LLM reasoning |
| `salary_hint` | TEXT | Nullable |
| `status` | TEXT | ApplicationStatus enum |
| `link` | TEXT | Apply URL |
| `run_id` | TEXT | FK to RunRecord |
| `created_at` | DATETIME | Auto |
| `updated_at` | DATETIME | Auto-updated |

### RunRecord table

| Column | Type | Notes |
|--------|------|-------|
| `id` | TEXT PK | UUID (8-char) |
| `run_date` | DATE | |
| `started_at` | DATETIME | |
| `finished_at` | DATETIME | Nullable until complete |
| `duration_secs` | FLOAT | Nullable |
| `queries_run` | INTEGER | |
| `raw_results` | INTEGER | |
| `parsed_ok` | INTEGER | |
| `parse_errors` | INTEGER | |
| `ranked_jobs` | INTEGER | |
| `new_added` | INTEGER | |
| `dupes_skipped` | INTEGER | |
| `low_score_skip` | INTEGER | |
| `status` | TEXT | running / complete / failed |
| `summary_text` | TEXT | LLM summary |
| `top_jobs` | JSON | Array of role@company strings |
| `errors` | JSON | Array of error strings |
| `langsmith_url` | TEXT | Optional |

---

## Local LLM Strategy

### Why Ollama?

JobHunterAI is designed for **unemployed people** who shouldn't be spending money on AI API costs. Ollama runs Mistral 7B on any modern laptop:

- **Free:** No API key, no usage costs, no token billing
- **Private:** Your job search profile, resume details, and fit notes never leave your machine
- **Offline capable:** After `ollama pull mistral:7b`, no internet is required for parse/rank
- **Fast enough:** Mistral 7B at 4-bit quantisation processes a batch of 15 job listings in 8–15 seconds on Apple Silicon M-series

### Model selection

The model is configurable via `config/profile.json`:

```json
{ "ollama_model": "mistral:7b" }
```

| Model | Size | Speed (M2) | Quality | Notes |
|-------|------|------------|---------|-------|
| `mistral:7b` | 4.1 GB | ~12s/batch | Excellent | **Default. Best balance.** |
| `qwen2.5:7b` | 4.4 GB | ~14s/batch | Excellent | Slightly more verbose output |
| `llama3.2:3b` | 2.0 GB | ~6s/batch | Good | Faster but occasionally mangled JSON |
| `qwen3.5:9b` | 5.6 GB | ~18s/batch | Very good | Current dev model, supports think-mode |

### Handling LLM output quality

Local models produce noisier output than commercial APIs. The parse pipeline has four layers of resilience:

1. **Prompt engineering** — `PARSE_SYSTEM` is explicit: "Your response MUST start with `[` and end with `]`"
2. **`_extract_json_array()`** — strips `<think>` blocks (Qwen3), strips markdown fences, tries array regex, falls back to single-object regex
3. **`_normalise_job_dict()`** — remaps field name aliases, coerces enum values, fills missing required fields with sensible defaults
4. **Pydantic v2 validators** — final gate; validation failures are logged to `parse_errors` in state, not raised to the caller

### Future: optional Claude fallback

The codebase has `langchain-anthropic` in `requirements.txt` and the import is commented out in `nodes.py`. To switch parse/rank to Claude:

```python
# In nodes.py _get_llm():
from langchain_anthropic import ChatAnthropic
return ChatAnthropic(model="claude-sonnet-4-5", temperature=0)
```

Requires `ANTHROPIC_API_KEY` in `.env`.

---

## Security Model

**Current model: local-only, trust-yourself.**

- The app runs entirely on localhost. There are no accounts, no cloud storage, no network services except Tavily (search) and optionally LangSmith (tracing)
- Your `profile.json` (personal details), job tracker CSV, and LLM prompts stay on disk
- CORS is restricted to `localhost:3000` in the FastAPI config — no external origins can call the API
- The Pydantic `reject_spam_roles` validator prevents injection-style content from landing in your tracker
- Tavily results are treated as untrusted text — they pass through LLM extraction before touching the schema

**What leaves your machine:**
| Service | Data sent | Required |
|---------|-----------|----------|
| Tavily | Search query strings (no profile data) | Yes |
| Ollama | Nothing — runs locally | — |
| LangSmith | Full LLM trace (prompts + responses) | Optional |

**If you enable LangSmith:** your prompts (which include your profile details) are sent to LangSmith's servers. LangSmith has a [data privacy policy](https://docs.smith.langchain.com/administration/privacy). Use the optional toggle consciously.

---

## Scaling Considerations

The current design is intentionally single-user, single-machine. If this were to evolve:

- **Multi-user:** Add auth (JWT or session), namespace all DB records by `user_id`, move SQLite to PostgreSQL
- **Cloud deployment:** FastAPI deploys cleanly to any container host; the LLM node would switch from Ollama to a cloud inference endpoint (Anthropic, Bedrock, Together AI)
- **Parallel search:** The current sequential Tavily loop could become `asyncio.gather()` — blocked today by Tavily free-tier rate limits but trivial to parallelize with a paid key
- **More job boards:** Adding a new board means adding queries to `profile.json`. No code change needed — Tavily handles URL targeting via `site:` query operators
- **Scheduled cloud runs:** The launchd scheduler could be replaced with a GitHub Actions cron job or a simple AWS Lambda for users without a persistent Mac
