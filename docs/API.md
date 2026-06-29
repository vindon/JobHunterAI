# JobHunterAI — API Reference

## Overview

The FastAPI backend exposes a REST API and an SSE (Server-Sent Events) streaming endpoint for the Next.js frontend. The API is local-only by design — no authentication is required.

> **Status:** This API is planned/in development. The agent core runs standalone via `main.py` today. The FastAPI layer is being built to power the web UI.

**Base URL:** `http://localhost:8000`

**Authentication:** None (local-only)

**Content type:** `application/json` for all requests and responses unless otherwise noted.

**CORS:** `http://localhost:3000` is the only permitted origin.

---

## Health

### GET /health

Check that the API is running and Ollama is reachable.

**Request:** None

**Response: 200 OK**
```json
{
  "status": "ok",
  "ollama": "reachable",
  "ollama_model": "mistral:7b",
  "tavily": "configured",
  "version": "2.0.0"
}
```

**Response: 200 OK (degraded)**
```json
{
  "status": "degraded",
  "ollama": "unreachable",
  "ollama_model": "mistral:7b",
  "tavily": "configured",
  "version": "2.0.0"
}
```

**Example:**
```bash
curl http://localhost:8000/health
```

---

## Jobs

### GET /api/jobs

Return a paginated, filtered list of all jobs in the tracker.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `per_page` | integer | 25 | Results per page (max: 100) |
| `status` | string | all | Filter by status. One of: `new`, `reviewing`, `applied`, `interview`, `offer`, `pass` |
| `country` | string | — | Filter by country (exact match, case-insensitive) |
| `job_type` | string | — | Filter by job type: `full-time`, `contract`, `part-time`, `fractional` |
| `remote_scope` | string | — | Filter by remote scope string (partial match) |
| `min_score` | integer | 0 | Minimum fit score (inclusive) |
| `max_score` | integer | 10 | Maximum fit score (inclusive) |
| `q` | string | — | Free-text search across `role` and `company` fields |
| `sort` | string | `date_found` | Sort field: `date_found`, `fit_score`, `company`, `role` |
| `order` | string | `desc` | Sort order: `asc`, `desc` |

**Response: 200 OK**
```json
{
  "items": [
    {
      "id": 1,
      "role": "Head of AI Strategy",
      "company": "Acme Corp",
      "country": "Australia",
      "job_type": "Contract",
      "remote_scope": "🌏 Anywhere in AU",
      "urgency": "⚡ Active",
      "source_portal": "SEEK AU",
      "date_found": "2026-06-29",
      "fit_score": 8,
      "fit_notes": "Strong alignment with AI roadmap and CX automation background.",
      "salary_hint": "AUD 180k",
      "status": "🆕 New",
      "link": "https://www.seek.com.au/job/12345678"
    }
  ],
  "total": 47,
  "page": 1,
  "per_page": 25,
  "pages": 2
}
```

**Example:**
```bash
# Get first page of applied jobs in Australia
curl "http://localhost:8000/api/jobs?status=applied&country=Australia&sort=fit_score&order=desc"

# Search for Deloitte roles scoring 7+
curl "http://localhost:8000/api/jobs?q=deloitte&min_score=7"
```

---

### GET /api/jobs/{id}

Return a single job by ID.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Job ID |

**Response: 200 OK**
```json
{
  "id": 1,
  "role": "Head of AI Strategy",
  "company": "Acme Corp",
  "country": "Australia",
  "job_type": "Contract",
  "remote_scope": "🌏 Anywhere in AU",
  "urgency": "⚡ Active",
  "source_portal": "SEEK AU",
  "date_found": "2026-06-29",
  "fit_score": 8,
  "fit_notes": "Strong alignment with AI roadmap and CX automation background.",
  "salary_hint": "AUD 180k",
  "status": "🆕 New",
  "link": "https://www.seek.com.au/job/12345678",
  "run_id": "f18d7104",
  "created_at": "2026-06-29T08:01:46Z",
  "updated_at": "2026-06-29T08:01:46Z"
}
```

**Response: 404 Not Found**
```json
{ "detail": "Job not found" }
```

**Example:**
```bash
curl http://localhost:8000/api/jobs/1
```

---

### PATCH /api/jobs/{id}

Update a job's mutable fields. Typically used to change application status from the Kanban board.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | integer | Job ID |

**Request body (all fields optional):**
```json
{
  "status": "📤 Applied",
  "fit_notes": "Applied via LinkedIn — spoke to recruiter Sarah.",
  "salary_hint": "AUD 200k"
}
```

**Updatable fields:** `status`, `fit_notes`, `salary_hint`

**Response: 200 OK**
```json
{
  "id": 1,
  "status": "📤 Applied",
  "updated_at": "2026-06-29T10:15:22Z"
}
```

**Response: 404 Not Found**
```json
{ "detail": "Job not found" }
```

**Response: 422 Unprocessable Entity**
```json
{
  "detail": [
    {
      "type": "enum",
      "loc": ["body", "status"],
      "msg": "value is not a valid enumeration member",
      "input": "invalid status"
    }
  ]
}
```

**Example:**
```bash
curl -X PATCH http://localhost:8000/api/jobs/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "📤 Applied"}'
```

---

### GET /api/jobs/stats

Aggregate statistics for the Dashboard.

**Request:** None

**Response: 200 OK**
```json
{
  "total": 47,
  "by_status": {
    "new": 22,
    "reviewing": 8,
    "applied": 12,
    "interview": 3,
    "offer": 1,
    "pass": 1
  },
  "by_country": {
    "Australia": 18,
    "UK": 14,
    "USA": 11,
    "New Zealand": 4
  },
  "by_job_type": {
    "Contract": 28,
    "Full-time": 16,
    "Part-time / Freelance": 2,
    "Fractional": 1
  },
  "score_distribution": {
    "0-2": 0,
    "3-4": 3,
    "5-6": 21,
    "7-8": 18,
    "9-10": 5
  },
  "average_fit_score": 6.8,
  "urgent_count": 4,
  "last_run_date": "2026-06-29",
  "last_run_new_jobs": 7
}
```

**Example:**
```bash
curl http://localhost:8000/api/jobs/stats
```

---

## Runs

### POST /api/runs/start

Start a new agent run. The run executes in a background thread; the response returns immediately with a `run_id` that can be used for SSE streaming.

**Request body (all optional):**
```json
{
  "dry_run": false,
  "profile_path": "config/profile.json",
  "verbose": false
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `dry_run` | boolean | false | If true, skip all write operations |
| `profile_path` | string | `"config/profile.json"` | Profile to use |
| `verbose` | boolean | false | Enable debug-level logging |

**Response: 202 Accepted**
```json
{
  "run_id": "a6d2d1e9",
  "status": "running",
  "started_at": "2026-06-29T08:00:00Z",
  "stream_url": "/api/runs/stream/a6d2d1e9",
  "dry_run": false
}
```

**Response: 409 Conflict** (if a run is already in progress)
```json
{
  "detail": "A run is already in progress",
  "active_run_id": "f18d7104"
}
```

**Response: 429 Too Many Requests** (rate limit)
```json
{
  "detail": "Rate limit exceeded. Only one run per 5 minutes is allowed.",
  "retry_after": 247
}
```
Headers: `Retry-After: 247`

**Example:**
```bash
# Start a run and capture the run_id
RUN_ID=$(curl -s -X POST http://localhost:8000/api/runs/start \
  -H "Content-Type: application/json" \
  -d '{}' | jq -r .run_id)

echo "Run ID: $RUN_ID"
```

---

### GET /api/runs/stream/{run_id}

Server-Sent Events (SSE) stream for a live run. Connect immediately after calling `/api/runs/start`. The stream stays open until the run completes or errors.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `run_id` | string | Run ID returned by `/api/runs/start` |

**Response:** `Content-Type: text/event-stream`

**SSE event format:**
```
event: <event_type>
data: <JSON payload>

```

(Note: each event is followed by a blank line. The `id:` field is omitted for simplicity.)

#### Event types

**`progress`** — A pipeline node has changed status.
```
event: progress
data: {"node": "search", "status": "active", "message": "Firing 11 Tavily queries..."}
```

Node values: `plan`, `search`, `parse`, `rank`, `write`, `report`

Status values: `active`, `complete`, `error`

---

**`log`** — A log line from the agent. Maps to the streaming log panel.
```
event: log
data: {"level": "INFO", "node": "search", "text": "Search [3/11]: site:reed.co.uk \"AI consultant\"...", "ts": "2026-06-29T08:00:12Z"}
```

Level values: `DEBUG`, `INFO`, `WARNING`, `ERROR`

---

**`job`** — A new job was found and ranked above the threshold.
```
event: job
data: {
  "role": "Head of AI Strategy",
  "company": "Acme Corp",
  "country": "Australia",
  "fit_score": 8,
  "fit_notes": "Strong alignment with AI roadmap.",
  "urgency": "⚡ Active",
  "remote_scope": "🌏 Anywhere in AU",
  "source_portal": "SEEK AU",
  "link": "https://seek.com.au/job/12345678",
  "is_new": true
}
```

`is_new: false` indicates the job was seen but is a duplicate (skipped).

---

**`complete`** — The run has finished successfully.
```
event: complete
data: {
  "run_id": "a6d2d1e9",
  "duration_secs": 78.3,
  "queries_run": 11,
  "raw_results": 52,
  "parsed_ok": 38,
  "parse_errors": 14,
  "ranked_jobs": 22,
  "new_added": 7,
  "dupes_skipped": 15,
  "low_score_skip": 0,
  "summary_text": "7 new AI leadership roles found. Top match: Head of AI Strategy at Acme Corp (8/10).",
  "top_jobs": [
    "Head of AI Strategy @ Acme Corp",
    "Director of AI @ Telstra",
    "VP AI @ ANZ Bank"
  ],
  "langsmith_url": "https://smith.langchain.com/o/default/projects/JobHunterAI"
}
```

---

**`error`** — The run encountered a fatal error.
```
event: error
data: {
  "run_id": "a6d2d1e9",
  "message": "Ollama not reachable at localhost:11434",
  "node": "parse",
  "ts": "2026-06-29T08:01:15Z"
}
```

---

**Example — consuming SSE in bash:**
```bash
curl -N http://localhost:8000/api/runs/stream/a6d2d1e9
```

**Example — consuming SSE in TypeScript (React hook):**
```typescript
function useRunStream(runId: string | null) {
  const [events, setEvents] = useState<RunEvent[]>([])

  useEffect(() => {
    if (!runId) return
    const es = new EventSource(`/api/runs/stream/${runId}`)

    es.addEventListener('log', (e) => {
      setEvents(prev => [...prev, { type: 'log', ...JSON.parse(e.data) }])
    })
    es.addEventListener('job', (e) => {
      setEvents(prev => [...prev, { type: 'job', ...JSON.parse(e.data) }])
    })
    es.addEventListener('complete', (e) => {
      setEvents(prev => [...prev, { type: 'complete', ...JSON.parse(e.data) }])
      es.close()
    })
    es.addEventListener('error', () => { es.close() })

    return () => es.close()
  }, [runId])

  return events
}
```

---

### GET /api/runs/history

Return a list of past runs, most recent first.

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number |
| `per_page` | integer | 20 | Max 50 |
| `status` | string | all | Filter: `running`, `complete`, `failed` |

**Response: 200 OK**
```json
{
  "items": [
    {
      "id": "a6d2d1e9",
      "run_date": "2026-06-29",
      "started_at": "2026-06-29T08:00:00Z",
      "finished_at": "2026-06-29T08:01:18Z",
      "duration_secs": 78.3,
      "status": "complete",
      "queries_run": 11,
      "new_added": 7,
      "dupes_skipped": 15,
      "top_jobs": [
        "Head of AI Strategy @ Acme Corp",
        "Director of AI @ Telstra"
      ],
      "langsmith_url": "https://smith.langchain.com/o/default/projects/JobHunterAI"
    }
  ],
  "total": 14,
  "page": 1,
  "per_page": 20,
  "pages": 1
}
```

**Example:**
```bash
curl "http://localhost:8000/api/runs/history?per_page=5"
```

---

## Profile

### GET /api/profile

Read the current `config/profile.json`.

**Response: 200 OK**
```json
{
  "name": "Alex Chen",
  "email": "alex@example.com",
  "min_seniority": "Senior Manager",
  "target_roles": ["Head of AI", "Director of AI Strategy"],
  "target_countries": ["Australia", "UK", "USA", "New Zealand"],
  "key_skills": ["Agentic AI", "LangGraph", "Generative AI"],
  "fit_score_threshold": 5,
  "max_results_per_query": 5,
  "days_back": 7,
  "ollama_model": "mistral:7b"
}
```

Note: `search_queries`, `broad_search_queries`, and `exclude_keywords` are returned via `/api/settings/queries`.

**Response: 404 Not Found**
```json
{ "detail": "config/profile.json not found. Copy config/profile.example.json to get started." }
```

---

### PATCH /api/profile

Update profile fields. Writes the updated profile back to `config/profile.json`.

**Request body (all fields optional):**
```json
{
  "name": "Alex Chen",
  "min_seniority": "Director",
  "target_roles": ["Head of AI", "Director of AI"],
  "target_countries": ["Australia", "UK"],
  "key_skills": ["Agentic AI", "LangGraph"],
  "fit_score_threshold": 6,
  "ollama_model": "qwen2.5:7b"
}
```

**Response: 200 OK**
```json
{ "status": "saved", "path": "config/profile.json" }
```

**Response: 400 Bad Request**
```json
{ "detail": "fit_score_threshold must be between 0 and 10" }
```

---

## Settings

### GET /api/settings

Return current agent settings (non-profile configuration).

**Response: 200 OK**
```json
{
  "ollama_model": "mistral:7b",
  "ollama_url": "http://localhost:11434",
  "fit_score_threshold": 5,
  "max_results_per_query": 5,
  "days_back": 7,
  "output_dir": "/Users/alex/Documents/JobHunterAI",
  "langsmith_enabled": true,
  "langsmith_project": "JobHunterAI",
  "dry_run_default": false
}
```

---

### PATCH /api/settings

Update agent settings.

**Request body (all optional):**
```json
{
  "fit_score_threshold": 6,
  "max_results_per_query": 8,
  "ollama_model": "llama3.2:3b"
}
```

**Response: 200 OK**
```json
{ "status": "saved" }
```

**Response: 422 Unprocessable Entity**
```json
{
  "detail": [
    {
      "type": "greater_than_equal",
      "loc": ["body", "fit_score_threshold"],
      "msg": "Input should be greater than or equal to 0"
    }
  ]
}
```

---

### GET /api/settings/queries

Return the current search queries from profile.json.

**Response: 200 OK**
```json
{
  "search_queries": [
    "site:seek.com.au \"head of AI\" remote 2026",
    "site:reed.co.uk \"AI strategy\" director remote 2026"
  ],
  "broad_search_queries": [
    "\"AI consultant\" remote director senior 2026"
  ],
  "exclude_keywords": ["junior", "intern", "entry level"]
}
```

---

### POST /api/settings/queries

Add a new search query.

**Request body:**
```json
{
  "query": "site:naukri.com \"AI strategy\" director remote 2026",
  "type": "search"
}
```

`type` values: `search` (main queries), `broad` (fallback queries)

**Response: 201 Created**
```json
{
  "status": "added",
  "index": 11,
  "total_queries": 12
}
```

**Response: 400 Bad Request**
```json
{ "detail": "Query already exists" }
```

---

### DELETE /api/settings/queries/{idx}

Remove a search query by its index in the array.

**Path parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `idx` | integer | Zero-based index in the `search_queries` array |

**Query parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `type` | string | `search` | `search` or `broad` |

**Response: 200 OK**
```json
{
  "status": "removed",
  "removed_query": "site:seek.com.au \"head of AI\" remote 2026",
  "total_queries": 10
}
```

**Response: 404 Not Found**
```json
{ "detail": "Query index 11 not found. Current range: 0–9" }
```

---

## Error Responses

All error responses follow this shape:

```json
{
  "detail": "Human-readable error message"
}
```

For validation errors (422), `detail` is an array:

```json
{
  "detail": [
    {
      "type": "string_too_short",
      "loc": ["body", "role"],
      "msg": "String should have at least 4 characters",
      "input": "AI",
      "ctx": { "min_length": 4 }
    }
  ]
}
```

### Status codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Successful GET, PATCH |
| 201 | Created | Successful POST (new resource) |
| 202 | Accepted | Run started (async) |
| 400 | Bad Request | Client error, invalid business logic |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate operation (run already running) |
| 422 | Unprocessable Entity | Request body fails schema validation |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Unexpected server error |

### Rate limiting

`POST /api/runs/start` is rate-limited to one run per 5 minutes to prevent accidental double-runs.

When the limit is hit:
- Response status: 429
- Response header: `Retry-After: <seconds>`
- Response body: `{"detail": "Rate limit exceeded...", "retry_after": <seconds>}`
