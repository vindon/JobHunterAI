# Contributing to JobHunterAI

Thank you for helping people find remote jobs. This is a free, community-driven project — every contribution matters.

## Ways to contribute

- **Add job portals** — new Tavily search queries for sites not yet covered
- **Add countries** — expand beyond AU, NZ, UK, USA
- **Improve parsing** — better prompt engineering for the local LLM
- **UI improvements** — design, accessibility, new features
- **Bug fixes** — open an issue, then a PR
- **Documentation** — clearer setup guides help non-technical users

## Development setup

```bash
git clone https://github.com/vindon/JobHunterAI.git
cd JobHunterAI
make install        # Python deps + npm install
make pull-model     # pulls mistral:7b via Ollama (~4 GB)
cp .env.example .env
# Add your TAVILY_API_KEY to .env
make dev            # starts API on :8000 and web on :3000
```

## Project structure

```
agent/      LangGraph pipeline — search, parse, rank, write, report nodes
api/        FastAPI backend — REST + SSE, SQLite persistence
web/        Next.js 14 frontend — 6 pages, warm design system
docs/       Architecture, requirements, design, API reference
config/     profile.json (your targets), profile.example.json (template)
```

## Adding a new job portal

1. Add a Tavily search query to `config/profile.json` → `search_queries`
2. Add the domain hint to `_PORTAL_HINTS` in `agent/nodes.py`
3. Test with `python main.py run --dry-run`

## Adding a new country

1. Add the country name to `config/profile.json` → `target_countries`
2. Add relevant search queries targeting that country's job sites
3. Add the country flag emoji to `web/lib/types.ts` → `COUNTRY_FLAGS`

## Code style

- Python: follow existing patterns, type-hint everything, no bare `except`
- TypeScript: strict mode, no `any`, prefer `const`
- Commits: `feat:`, `fix:`, `docs:`, `refactor:` prefixes

## Pull request checklist

- [ ] `python -m py_compile agent/*.py api/**/*.py` passes
- [ ] `cd web && npm run build` passes
- [ ] `python main.py check` passes
- [ ] Tested with `python main.py run --dry-run`
- [ ] No API keys or personal data committed

## Community

This project exists to help people who are actively job hunting — especially those recently unemployed. Please keep the community welcoming and focused on that mission.

Issues and discussions: https://github.com/vindon/JobHunterAI/issues
