#!/usr/bin/env python3
"""
╔══════════════════════════════════════════════════════════════╗
║  JobHunterAI  —  Autonomous Global Job Search Agent         ║
║  LangGraph + Pydantic v2 + Claude Sonnet 4.6 + LangSmith   ║
║                                                              ║
║  Run:   python main.py                                       ║
║  Help:  python main.py --help                                ║
╚══════════════════════════════════════════════════════════════╝
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

# ── Load .env before importing anything that needs keys ──────────
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass   # python-dotenv optional; keys can be set in shell


def _setup_logging(verbose: bool = False) -> None:
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s  %(name)-20s  %(levelname)-7s  %(message)s",
        datefmt="%H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                Path("logs") / f"run_{__import__('datetime').date.today()}.log",
                mode="a",
            ),
        ],
    )
    # Quiet noisy libraries
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("anthropic").setLevel(logging.WARNING)


def _check_prerequisites() -> list[str]:
    """Return list of missing/misconfigured prerequisites."""
    problems = []

    # Ollama mode — ANTHROPIC_API_KEY not required
    if not os.environ.get("TAVILY_API_KEY"):
        problems.append("TAVILY_API_KEY not set  →  get free key at app.tavily.com")

    if not Path("config/profile.json").exists():
        problems.append(
            "config/profile.json not found  →  copy config/profile.example.json and fill it in"
        )

    try:
        import langgraph
        import langchain_ollama
        import pydantic
        import tavily
    except ImportError as e:
        problems.append(f"Missing package: {e}  →  pip install -r requirements.txt")

    # Check Ollama is reachable
    try:
        import httpx
        r = httpx.get("http://localhost:11434/api/tags", timeout=3)
        if r.status_code != 200:
            problems.append("Ollama not reachable at localhost:11434 — run: brew services start ollama")
    except Exception:
        problems.append("Ollama not reachable at localhost:11434 — run: brew services start ollama")

    return problems


# ══════════════════════════════════════════════════════════════════
# COMMANDS
# ══════════════════════════════════════════════════════════════════

def cmd_run(args) -> None:
    """Run the full agent pipeline."""
    Path("logs").mkdir(exist_ok=True)
    _setup_logging(verbose=args.verbose)
    log = logging.getLogger("main")

    problems = _check_prerequisites()
    if problems:
        print("\n⚠️  Prerequisites not met:\n")
        for p in problems:
            print(f"  ✗  {p}")
        print("\nFix the above, then re-run.\n")
        sys.exit(1)

    if args.dry_run:
        log.info("DRY RUN — will search and parse but NOT write to CSV")
        os.environ["JOBHUNTERAI_DRY_RUN"] = "1"

    from agent.graph import run_agent
    profile_path = args.profile or "config/profile.json"

    print(f"\n🚀 JobHunterAI starting  |  profile: {profile_path}\n")
    report = run_agent(config_path=profile_path)

    print(f"\n{'─'*60}")
    print(f"  ✅ Run complete  |  {report.new_added} new jobs added")
    print(f"  📄 CSV saved:   {report.sheet_url}")
    if report.langsmith_url:
        print(f"  🔍 LangSmith:   {report.langsmith_url}")
    print(f"  ⏱  Duration:    {report.duration_secs:.1f}s")
    print(f"{'─'*60}\n")


def cmd_check(args) -> None:
    """Check prerequisites without running."""
    problems = _check_prerequisites()
    if not problems:
        print("\n✅ All prerequisites met — ready to run!\n")
    else:
        print(f"\n⚠️  {len(problems)} issue(s) found:\n")
        for p in problems:
            print(f"  ✗  {p}")
        print()
        sys.exit(1)


def cmd_add_job(args) -> None:
    """Manually add a job to the CSV tracker."""
    Path("logs").mkdir(exist_ok=True)
    _setup_logging()

    from agent.schemas import JobListing, UrgencyLevel
    from agent.tools import append_jobs_to_csv, load_existing_keys, get_csv_path

    job = JobListing(
        role          = args.role,
        company       = args.company,
        country       = args.country,
        job_type      = args.job_type,
        remote_scope  = args.remote,
        source_portal = args.source,
        link          = args.link,
        urgency       = UrgencyLevel.URGENT if args.urgent else UrgencyLevel.ACTIVE,
        salary_hint   = args.salary or "",
        fit_notes     = args.notes or "",
    )

    csv_path      = get_csv_path()
    existing_keys = load_existing_keys(csv_path)

    if job.dedup_key() in existing_keys:
        print(f"\n⟳ Already in tracker: {job.role} @ {job.company}\n")
    else:
        added = append_jobs_to_csv([job.to_sheet_row()])
        if added:
            print(f"\n✅ Added: {job.role} @ {job.company}")
            print(f"   Saved to: {csv_path}\n")
        else:
            print("\n❌ Write failed — check logs\n")
            sys.exit(1)


def cmd_schedule(args) -> None:
    """Print the macOS launchd plist to schedule daily runs."""
    script_path = Path(__file__).parent.absolute() / "run_daily.sh"
    username    = os.environ.get("USER", "yourusername")
    print(f"""
To schedule JobHunterAI to run daily at 07:30 IST (02:00 UTC):

1. Create the plist file:
   nano ~/Library/LaunchAgents/com.jobhunterai.daily.plist

2. Paste this content (update paths as needed):

<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.jobhunterai.daily</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>/Users/{username}/Projects/JobHunterAI/run_daily.sh</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>2</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>/Users/{username}/Projects/JobHunterAI/logs/launchd.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/{username}/Projects/JobHunterAI/logs/launchd_err.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
  </dict>
  <key>RunAtLoad</key><false/>
</dict>
</plist>

3. Load it:
   launchctl load ~/Library/LaunchAgents/com.jobhunterai.daily.plist

4. Verify:
   launchctl list | grep jobhunterai

5. To unload:
   launchctl unload ~/Library/LaunchAgents/com.jobhunterai.daily.plist
""")


# ══════════════════════════════════════════════════════════════════
# CLI PARSER
# ══════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        prog="jobhunterai",
        description="🌐 JobHunterAI — Autonomous global job search agent",
    )
    parser.add_argument("--version", action="version", version="JobHunterAI 2.0")
    sub = parser.add_subparsers(dest="command")

    # ── run ───────────────────────────────────────────────────────
    p_run = sub.add_parser("run", help="Run the full agent pipeline (default)")
    p_run.add_argument("--profile", default="config/profile.json",
                       help="Path to user profile JSON")
    p_run.add_argument("--dry-run", action="store_true",
                       help="Search and parse but do NOT write to Google Sheets")
    p_run.add_argument("--verbose", "-v", action="store_true",
                       help="Debug-level logging")
    p_run.set_defaults(func=cmd_run)

    # ── check ─────────────────────────────────────────────────────
    p_check = sub.add_parser("check", help="Verify prerequisites (keys, packages, sheet)")
    p_check.set_defaults(func=cmd_check)

    # ── add ───────────────────────────────────────────────────────
    p_add = sub.add_parser("add", help="Manually add a job to Google Sheet")
    p_add.add_argument("role",    help='e.g. "Director of AI"')
    p_add.add_argument("company", help='e.g. "KPMG Australia"')
    p_add.add_argument("country", help='e.g. Australia')
    p_add.add_argument("link",    help="Apply / listing URL")
    p_add.add_argument("--job-type",  default="Full-time")
    p_add.add_argument("--remote",    default="🌐 Remote")
    p_add.add_argument("--source",    default="Direct")
    p_add.add_argument("--salary",    default="")
    p_add.add_argument("--notes",     default="")
    p_add.add_argument("--urgent",    action="store_true")
    p_add.add_argument("--profile",   default="config/profile.json")
    p_add.set_defaults(func=cmd_add_job)

    # ── schedule ──────────────────────────────────────────────────
    p_sched = sub.add_parser("schedule", help="Print macOS launchd scheduling instructions")
    p_sched.set_defaults(func=cmd_schedule)

    # ── Default: run if no subcommand ─────────────────────────────
    args = parser.parse_args()
    if not args.command:
        args = parser.parse_args(["run"] + sys.argv[1:])

    if hasattr(args, "func"):
        args.func(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
