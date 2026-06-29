#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────
# run_daily.sh — JobHunterAI Daily Runner
# Called by macOS launchd at 07:30 IST (02:00 UTC)
# Can also be run manually: ./run_daily.sh
# ─────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
mkdir -p logs

# Load secrets from .env
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Prefer homebrew Python on Apple Silicon
PYTHON="${PYTHON_PATH:-/opt/homebrew/bin/python3}"
if ! command -v "$PYTHON" &>/dev/null; then
  PYTHON="python3"
fi

echo "[$(date '+%Y-%m-%d %H:%M')] JobHunterAI starting..."
"$PYTHON" main.py run
echo "[$(date '+%Y-%m-%d %H:%M')] JobHunterAI done."
