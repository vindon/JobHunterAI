# JobHunterAI — Your Personal AI Job Hunting Agent

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://python.org)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org)
[![LangGraph](https://img.shields.io/badge/LangGraph-0.3%2B-orange.svg)](https://github.com/langchain-ai/langgraph)
[![Free Forever](https://img.shields.io/badge/Free-Forever-brightgreen.svg)](#)
[![Runs Locally](https://img.shields.io/badge/Runs-100%25%20Locally-purple.svg)](#)

**JobHunterAI** is a free, open-source AI-powered job hunting agent built for people who are actively searching for work. It aggregates results from 11+ job boards globally, scores every listing against your personal profile using a local AI model (Mistral 7B via Ollama — no API costs), tracks your applications through a Kanban board, and shows you a live view of the multi-agent pipeline as it runs. Your data never leaves your machine.

Built by a job seeker, for job seekers. Free forever.

---

## Screenshots

> _Screenshots will be added after the web UI is complete._
>
> **Dashboard** — live stats on active applications, fit score distribution, countries, and recent runs.
>
> **Jobs Board** — filterable table and Kanban view of all discovered jobs, with AI fit scores and notes.
>
> **Run Agent** — three-panel view with live pipeline visualiser, streaming log output, and instant job results.

---

## Features

- **11+ job boards searched simultaneously** — SEEK AU, SEEK NZ, Reed UK, Indeed US/UK, LinkedIn, Remote Rocketship, Gartner, and more, all via a single Tavily API call per query
- **7-day freshness filter** — Tavily's `days=7` parameter means every result is from the last week; no stale listings
- **AI-powered fit scoring** — local Mistral 7B (via Ollama) scores every job 0–10 against your skills, seniority, and target countries; only jobs scoring 5+ reach your tracker
- **Privacy-first, fully local** — the AI model runs on your machine via Ollama; your resume, profile, and job data never leave your device
- **Zero ongoing cost** — Tavily's free tier covers daily runs; Ollama is free; the app is free; no subscriptions
- **Application Kanban** — track every job from "New" through "Applied", "Interview", and "Offer" in a drag-and-drop board
- **Live pipeline visualiser** — watch each LangGraph node light up in real time in your browser as the agent runs
- **Scheduled daily runs** — set it and forget it with macOS launchd; wake up to fresh jobs every morning
- **Dry-run mode** — `--dry-run` lets you test searches and parsing without writing anything
- **Manual job entry** — `python main.py add` lets you add jobs you found yourself directly to the tracker
- **LangSmith observability** — optional but recommended; traces every node, token cost, and decision for free
- **Open source (MIT)** — fork it, modify it, share it

---

## Architecture

```
Browser
  │
  ▼
┌─────────────────────────────────┐
│  Next.js 16  (web/)             │  Port 3000
│  Dashboard · Jobs · Run Agent   │
└─────────────────┬───────────────┘
                  │ /api/* proxy
                  ▼
┌─────────────────────────────────┐
│  FastAPI  (api/)                │  Port 8000
│  REST + SSE streaming           │
│  SQLite via SQLModel            │
└─────────────────┬───────────────┘
                  │ run_agent()
                  ▼
┌─────────────────────────────────────────────────────────┐
│  LangGraph Agent  (agent/)                              │
│                                                         │
│  supervisor_plan → search → parse → rank → write        │
│                       ↑                                 │
│                    (retry)                              │
│                                        → report         │
└──────────┬──────────────┬──────────────────────────────┘
           │              │
           ▼              ▼
    ┌────────────┐  ┌─────────────────┐
    │  Tavily    │  │  Ollama         │
    │  Web Search│  │  Mistral 7B     │
    │  (11 queries)  │  (parse + rank) │
    └────────────┘  └─────────────────┘
                          │
                          ▼
                   ┌────────────┐
                   │  SQLite    │
                   │  + CSV     │
                   └────────────┘
```

---

## Quick Start

Five steps to your first job search run:

```bash
# 1. Clone the repo
git clone https://github.com/yourusername/JobHunterAI.git
cd JobHunterAI

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Install Ollama and pull the model
brew install ollama
ollama pull mistral:7b

# 4. Copy .env.example, add your Tavily key
cp .env.example .env
# Edit .env: add TAVILY_API_KEY (free at app.tavily.com)

# 5. Copy your profile, verify setup, run
cp config/profile.example.json config/profile.json
python main.py check   # should print: All prerequisites met
python main.py run     # first run!
```

That's it. Your results land in `~/Documents/JobHunterAI/jobs_tracker.csv`.

---

## Full Setup Guide

### Requirements

| Tool | Version | Purpose | Cost |
|------|---------|---------|------|
| Python | 3.10+ | Agent runtime | Free |
| Ollama | Latest | Local LLM host | Free |
| Mistral 7B | mistral:7b | Parse + rank jobs | Free |
| Tavily API key | — | Web search (11 queries/run) | Free (1,000/month) |
| Node.js | 18+ | Web frontend | Free |

**macOS (M-series) users:** use `/opt/homebrew/bin/python3` if you have multiple Python installs.

### Step 1 — Clone the project

```bash
git clone https://github.com/yourusername/JobHunterAI.git
cd JobHunterAI
```

### Step 2 — Python environment

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Step 3 — Install Ollama and pull Mistral

Ollama runs Mistral 7B (and other models) locally on your machine. No API key, no cost, no data sent anywhere.

```bash
# macOS
brew install ollama
brew services start ollama

# Pull the model (one-time, ~4 GB download)
ollama pull mistral:7b

# Verify it's running
ollama list
```

Ollama must be running before you start the agent. On macOS, `brew services start ollama` keeps it running in the background.

**Alternative models:** you can use any Ollama-compatible model. Faster/smaller options:
- `mistral:7b` — recommended (4 GB, fast, reliable JSON output)
- `qwen2.5:7b` — slightly more verbose, good at structured extraction
- `llama3.2:3b` — fastest, 2 GB, good enough for parsing

Set your preferred model in `config/profile.json`:
```json
{ "ollama_model": "mistral:7b" }
```

### Step 4 — Get a Tavily API key

Tavily is the search engine that queries all job boards simultaneously.

1. Sign up at [app.tavily.com](https://app.tavily.com) (Google login works)
2. Copy your API key from the dashboard
3. Free tier: 1,000 searches/month — enough for 30+ daily runs

### Step 5 — Configure your environment

```bash
cp .env.example .env
```

Open `.env` and fill in at minimum:

```bash
TAVILY_API_KEY=tvly-your-key-here
```

LangSmith is optional but strongly recommended for debugging:

```bash
# Free at smith.langchain.com — 5,000 traces/month
LANGCHAIN_API_KEY=ls__your-key-here
LANGCHAIN_TRACING_V2=true
LANGCHAIN_PROJECT=JobHunterAI
```

### Step 6 — Configure your profile

```bash
cp config/profile.example.json config/profile.json
```

Edit `config/profile.json` to match **your** target roles and skills:

```json
{
  "name": "Your Name",
  "min_seniority": "Senior Manager",
  "target_roles": [
    "Head of AI",
    "Director of AI Strategy",
    "AI Transformation Lead"
  ],
  "target_countries": ["USA", "UK", "Australia", "New Zealand"],
  "key_skills": ["LangGraph", "Generative AI", "AI Governance"],
  "fit_score_threshold": 5,
  "ollama_model": "mistral:7b",
  "search_queries": [
    "site:seek.com.au \"head of AI\" remote 2026",
    "site:reed.co.uk \"AI strategy\" director remote 2026"
  ]
}
```

The more precisely you fill in `target_roles`, `key_skills`, and `search_queries`, the better Mistral can score jobs for you.

### Step 7 — Verify everything

```bash
python main.py check
```

Expected output:
```
✅ All prerequisites met — ready to run!
```

### Step 8 — First run

```bash
python main.py run
```

Watch it work:
```
08:00:01  SUPERVISOR: Planning run
08:00:03  SEARCH: Firing Tavily queries
08:00:04    Search [1/11]: site:seek.com.au "head of AI"...
08:00:48  PARSE: Extracting + validating jobs
08:01:12  RANK: Scoring jobs against profile
08:01:45  WRITE: Saving to CSV
08:01:46    ✅ NEW: Head of AI Strategy @ Consulting Co [Australia] 8/10
08:01:47  SUPERVISOR: Generating report
──────────────────────────────────────────────────
  ✅ Run complete  |  7 new jobs added
  📄 CSV saved:   ~/Documents/JobHunterAI/jobs_tracker.csv
  ⏱  Duration:    78.3s
──────────────────────────────────────────────────
```

### Step 9 (optional) — Start the web UI

```bash
# Terminal 1 — FastAPI backend
cd api && uvicorn main:app --reload

# Terminal 2 — Next.js frontend
cd web && npm install && npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

---

## Configuration

### profile.json fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Your name (used in prompts) |
| `email` | string | Contact email (not sent anywhere) |
| `min_seniority` | string | Minimum seniority level (e.g. "Senior Manager") |
| `target_roles` | string[] | Job titles you want (drives scoring) |
| `target_countries` | string[] | Countries to focus on (e.g. "Australia", "USA") |
| `key_skills` | string[] | Your skills (drives scoring) |
| `fit_score_threshold` | int | Minimum fit score to keep a job (default: 5) |
| `max_results_per_query` | int | Tavily results per query (default: 5) |
| `days_back` | int | Freshness window in days (default: 7) |
| `ollama_model` | string | Local model to use (default: "mistral:7b") |
| `search_queries` | string[] | Tavily search queries to run |
| `broad_search_queries` | string[] | Fallback queries when results are thin |
| `exclude_keywords` | string[] | Reject any job title containing these |

### Adding search queries for a new country

Edit `config/profile.json` and add to `search_queries`:

```json
"search_queries": [
  "site:seek.com.au \"head of AI\" remote 2026",
  "site:naukri.com \"AI strategy\" director remote 2026",
  "\"head of AI\" India remote globally 2026"
]
```

### Adjusting the fit score threshold

The threshold is in `config/profile.json`:

```json
{ "fit_score_threshold": 5 }
```

Lowering to 4 lets more jobs through. Raising to 7 keeps only strong matches.

---

## Running the Agent

```bash
# Full run — searches, parses, scores, writes to CSV
python main.py run

# Dry run — searches and parses but does NOT write anything
python main.py run --dry-run

# Debug logging — see every Tavily result and LLM response
python main.py run --verbose

# Custom profile
python main.py run --profile config/my-other-profile.json

# Add a job manually
python main.py add \
  "Director of AI" "Deloitte Australia" "Australia" \
  "https://apply.deloitte.com/job/12345" \
  --source "Direct" --salary "AUD 240k" --urgent

# Verify prerequisites
python main.py check

# Print launchd scheduling instructions (macOS daily automation)
python main.py schedule
```

## Starting the Web UI

```bash
# Backend (in one terminal)
cd api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# Frontend (in another terminal)
cd web
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The frontend proxies all `/api/*` requests to the FastAPI backend, so no CORS configuration is needed during development.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Agent orchestration | LangGraph 0.3+ | State machine, conditional routing, retries |
| LLM inference | Ollama + Mistral 7B | Parse + rank nodes (fully local) |
| Web search | Tavily API | Multi-portal search with freshness filter |
| Data validation | Pydantic v2 | Schema enforcement, spam rejection, dedup |
| Output | SQLite + CSV | Job storage and application tracking |
| Observability | LangSmith | Optional trace viewer, free tier |
| Scheduling | macOS launchd | Daily automated runs |
| Backend API | FastAPI + SQLModel | REST + SSE streaming for the web UI |
| Frontend | Next.js 16, TypeScript | Dashboard, Jobs Board, Run Agent |
| UI components | shadcn/ui, Tailwind CSS 4 | Component library, styling |
| Animations | Framer Motion | Pipeline visualiser, transitions |
| Server state | TanStack Query | API data fetching and caching |
| Client state | Zustand | UI state (filters, sidebar, run status) |
| Drag and drop | dnd-kit | Kanban board card movement |
| Charts | Recharts | Dashboard stats and score distribution |

---

## Project Structure

```
JobHunterAI/
├── main.py                    # CLI entrypoint (run / check / add / schedule)
├── run_daily.sh               # Shell wrapper for launchd
├── requirements.txt           # Python dependencies
├── Makefile                   # Convenience commands
├── .env.example               # Copy to .env, fill in keys
├── .gitignore
│
├── agent/                     # LangGraph agent (the core)
│   ├── graph.py               # StateGraph definition + run entrypoint
│   ├── nodes.py               # 6 node functions (plan/search/parse/rank/write/report)
│   ├── prompts.py             # All LLM prompt templates
│   ├── schemas.py             # Pydantic v2 models (JobListing, AgentState, RunReport)
│   └── tools.py               # Tavily search + CSV I/O
│
├── api/                       # FastAPI backend (planned)
│   ├── main.py                # App factory, CORS, lifespan
│   ├── routes/                # Route modules (jobs, runs, profile, settings)
│   ├── services/              # Business logic
│   └── models.py              # SQLModel ORM models
│
├── web/                       # Next.js 16 frontend
│   ├── app/                   # App Router pages
│   │   ├── layout.tsx         # Root layout (fonts, providers)
│   │   ├── page.tsx           # Dashboard
│   │   ├── jobs/page.tsx      # Jobs Board (table + kanban)
│   │   └── run/page.tsx       # Run Agent (pipeline + logs)
│   ├── components/            # Shared components
│   ├── lib/                   # API client, utils
│   └── next.config.ts         # API proxy rewrites
│
├── config/
│   ├── profile.example.json   # Copy to profile.json, personalise
│   └── profile.json           # Your profile (gitignored)
│
├── logs/                      # Run reports (JSON + text)
│   ├── run_YYYY-MM-DD.log
│   └── run_YYYY-MM-DD_<id>.json
│
└── docs/                      # Project documentation
    ├── ARCHITECTURE.md
    ├── REQUIREMENTS.md
    ├── DESIGN.md
    └── API.md
```

---

## Scheduling Daily Runs (macOS)

```bash
# Print the launchd plist + instructions
python main.py schedule

# Manually load the plist (after creating it per the printed instructions)
launchctl load ~/Library/LaunchAgents/com.jobhunterai.daily.plist

# Verify it's loaded
launchctl list | grep jobhunterai

# Unload (stop scheduling)
launchctl unload ~/Library/LaunchAgents/com.jobhunterai.daily.plist
```

Default schedule: 02:00 UTC daily (07:30 IST, 12:00 AEST).

---

## Observability with LangSmith

LangSmith is a free observability platform for LangGraph agents. Every node, token, and decision is captured.

1. Sign up at [smith.langchain.com](https://smith.langchain.com) (free tier: 5,000 traces/month)
2. Add to `.env`:
   ```
   LANGCHAIN_API_KEY=ls__your-key-here
   LANGCHAIN_TRACING_V2=true
   LANGCHAIN_PROJECT=JobHunterAI
   ```
3. Run the agent — traces appear at `smith.langchain.com` → Projects → JobHunterAI

Free tier covers 6+ months of daily runs.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `TAVILY_API_KEY not set` | Add to `.env` — get free key at app.tavily.com |
| `Ollama not reachable` | Run `brew services start ollama` |
| `Model not found` | Run `ollama pull mistral:7b` |
| Agent returns 0 results | Tavily quota exhausted — check app.tavily.com dashboard |
| Parse rejects too many jobs | Lower `fit_score_threshold` in profile.json or review prompts |
| Too many duplicates skipped | Normal — dedup is working; existing jobs stay out |
| LangSmith not tracing | Add `LANGCHAIN_API_KEY` to `.env` |
| `config/profile.json not found` | Run `cp config/profile.example.json config/profile.json` |
| Web UI not connecting | Ensure FastAPI is running on port 8000 |

---

## Contributing

Contributions are welcome. Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/add-canada-queries`)
3. Make your changes with clear commit messages
4. Test with `python main.py run --dry-run`
5. Open a pull request

Good first contributions:
- Add search queries for new countries or job boards
- Improve the parse or rank prompts
- Add new filter options to the web UI
- Write tests for schema validation

Please open an issue before starting large changes.

---

## License

MIT License — see [LICENSE](LICENSE) for details.

Free to use, modify, and distribute. No warranty.

---

Built with ❤️ for the job hunting community
