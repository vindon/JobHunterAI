# JobHunterAI — Claude Code Project Memory

## What this project is
An autonomous LangGraph agent that searches for remote AI strategy / CX automation
jobs globally (USA, UK, AU, NZ), validates results with Pydantic v2, scores them
against a user profile using Claude Sonnet 4.6, and writes new listings to Google Sheets.
Observability via LangSmith. Scheduled via macOS launchd.

## Architecture
- `agent/graph.py` — LangGraph StateGraph (6 nodes: plan, search, parse, rank, write, report)
- `agent/nodes.py` — all node functions (each takes AgentState → returns partial update)
- `agent/schemas.py` — Pydantic v2 models: JobListing, AgentState, RunReport
- `agent/prompts.py` — all Claude prompt templates (supervisor, parse, rank, summary)
- `agent/tools.py` — Tavily search + gspread Google Sheets I/O
- `main.py` — CLI entrypoint (run / check / add / schedule subcommands)
- `config/profile.json` — user profile (gitignored; copy from profile.example.json)
- `.env` — API keys (gitignored; copy from .env.example)

## Key design decisions
- LangGraph handles orchestration, checkpointing, conditional routing
- Claude Sonnet 4.6 (temperature=0) used for parse + rank + supervisor nodes
- Pydantic v2 validates every job before it touches the sheet — rejects junk
- Tavily `days=7` parameter enforces 7-day freshness at the query level
- Google Sheets write uses `append_rows()` (batch) not row-by-row
- Dedup is done by loading existing (role, company, country) keys from the sheet
- LangSmith tracing enabled via LANGCHAIN_API_KEY env var
- ReAct loop: supervisor_plan → search (retry edge) → parse (skip edge) → rank → write → report
- MIN_FIT_SCORE = 5 (jobs below this are not written to sheet)

## Running the agent
```bash
python main.py run           # full run
python main.py run --dry-run # no sheet writes
python main.py check         # verify prerequisites
python main.py add "..." ... # manual job add
```

## Environment variables required
- ANTHROPIC_API_KEY — Claude API
- TAVILY_API_KEY — Tavily web search
- GOOGLE_SERVICE_ACCOUNT_JSON — path to service account JSON file
- LANGCHAIN_API_KEY — LangSmith observability (optional but recommended)

## Python version
Python 3.10+, macOS ARM64 (M-series). Use /opt/homebrew/bin/python3.

## Common tasks for Claude Code
- "Add a new search query for Canada" → edit config/profile.json search_queries
- "Lower the fit score threshold" → edit MIN_FIT_SCORE in agent/nodes.py
- "Add a new country (India)" → update COUNTRY_SIGNALS in agent/tools.py and profile
- "Fix parse rejecting too many jobs" → review PARSE_SYSTEM prompt in agent/prompts.py
- "Add email notification on run complete" → add to node_supervisor_report in agent/nodes.py
- "Run and show me what Tavily returns" → python main.py run --dry-run --verbose
