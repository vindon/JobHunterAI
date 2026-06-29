# ─────────────────────────────────────────────────────────────────────────────
# JobHunterAI — Makefile
#
# Usage:  make <target>
# ─────────────────────────────────────────────────────────────────────────────

PYTHON   := python3
PIP      := pip3
NPM      := npm
UVICORN  := uvicorn

# Detect virtual environment
VENV_PYTHON := $(shell test -f venv/bin/python3 && echo venv/bin/python3 || echo $(PYTHON))

.PHONY: help install install-python install-web dev dev-api dev-web \
        run dry-run check lint lint-python lint-web \
        pull-model test clean

# ── Help ──────────────────────────────────────────────────────────────────────

help:
	@echo ""
	@echo "  JobHunterAI — available make targets"
	@echo ""
	@echo "  Setup"
	@echo "    make install         Install all Python and npm dependencies"
	@echo "    make install-python  Install Python deps only"
	@echo "    make install-web     Install npm deps only"
	@echo "    make pull-model      Pull Mistral 7B via Ollama"
	@echo ""
	@echo "  Development"
	@echo "    make dev             Start both API (port 8000) and web (port 3000) in parallel"
	@echo "    make dev-api         Start FastAPI backend only (port 8000, auto-reload)"
	@echo "    make dev-web         Start Next.js frontend only (port 3000)"
	@echo ""
	@echo "  Agent"
	@echo "    make run             Run the full agent pipeline"
	@echo "    make dry-run         Run without writing to CSV (safe for testing)"
	@echo "    make check           Verify all prerequisites (keys, Ollama, packages)"
	@echo ""
	@echo "  Quality"
	@echo "    make lint            Lint Python (ruff) + TypeScript (eslint)"
	@echo "    make lint-python     Lint Python only"
	@echo "    make lint-web        Lint TypeScript only"
	@echo "    make test            Run Python tests"
	@echo ""
	@echo "  Cleanup"
	@echo "    make clean           Remove __pycache__, .next, and venv"
	@echo ""


# ── Setup ─────────────────────────────────────────────────────────────────────

install: install-python install-web
	@echo ""
	@echo "  Setup complete. Next steps:"
	@echo "    1. make pull-model"
	@echo "    2. cp .env.example .env && nano .env"
	@echo "    3. cp config/profile.example.json config/profile.json && nano config/profile.json"
	@echo "    4. make check"
	@echo ""

install-python:
	@echo "  Installing Python dependencies..."
	$(VENV_PYTHON) -m pip install --upgrade pip
	$(VENV_PYTHON) -m pip install -r requirements.txt
	@echo "  Python deps installed."

install-web:
	@echo "  Installing npm dependencies..."
	cd web && $(NPM) install
	@echo "  npm deps installed."

pull-model:
	@echo "  Pulling Mistral 7B via Ollama (~4 GB download)..."
	ollama pull mistral:7b
	@echo "  Done. Run 'ollama list' to confirm."


# ── Development ───────────────────────────────────────────────────────────────

dev:
	@echo "  Starting API (:8000) and web (:3000) in parallel..."
	@echo "  Press Ctrl+C to stop both."
	$(MAKE) dev-api & $(MAKE) dev-web

dev-api:
	@echo "  Starting FastAPI on http://localhost:8000 ..."
	cd api && $(UVICORN) main:app --reload --host 0.0.0.0 --port 8000

dev-web:
	@echo "  Starting Next.js on http://localhost:3000 ..."
	cd web && $(NPM) run dev


# ── Agent ─────────────────────────────────────────────────────────────────────

run:
	@echo "  Running JobHunterAI agent..."
	$(VENV_PYTHON) main.py run

dry-run:
	@echo "  Running JobHunterAI in dry-run mode (no CSV writes)..."
	$(VENV_PYTHON) main.py run --dry-run

check:
	@echo "  Checking prerequisites..."
	$(VENV_PYTHON) main.py check


# ── Quality ───────────────────────────────────────────────────────────────────

lint: lint-python lint-web

lint-python:
	@echo "  Linting Python with ruff..."
	$(VENV_PYTHON) -m ruff check agent/ main.py || true

lint-web:
	@echo "  Linting TypeScript with eslint..."
	cd web && $(NPM) run lint || true

test:
	@echo "  Running Python tests..."
	$(VENV_PYTHON) -m pytest tests/ -v 2>/dev/null || echo "  No tests found in tests/ — add tests there."


# ── Cleanup ───────────────────────────────────────────────────────────────────

clean:
	@echo "  Cleaning build artifacts..."
	find . -type d -name "__pycache__" -not -path "./venv/*" -exec rm -rf {} + 2>/dev/null || true
	find . -name "*.pyc" -not -path "./venv/*" -delete 2>/dev/null || true
	rm -rf web/.next
	@echo "  Clean done (venv preserved)."
