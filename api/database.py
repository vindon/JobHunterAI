"""
database.py — SQLite database setup for JobHunterAI API

Uses SQLModel (SQLAlchemy + Pydantic integration).
Database file lives at <project_root>/data/jobs.db.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Generator

from sqlmodel import Session, SQLModel, create_engine

log = logging.getLogger("JobHunterAI.api.database")

# ── Project root is two levels up from this file (api/database.py → project/) ──
PROJECT_ROOT = Path(__file__).parent.parent.resolve()

DATA_DIR = PROJECT_ROOT / "data"
DATA_DIR.mkdir(exist_ok=True)

DB_PATH = DATA_DIR / "jobs.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"

# connect_args: check_same_thread=False is required for SQLite + FastAPI
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
    echo=False,
)


def create_db_and_tables() -> None:
    """Create all SQLModel table schemas in the database (idempotent)."""
    log.info(f"Initialising database at {DB_PATH}")
    SQLModel.metadata.create_all(engine)
    log.info("Database tables ready")


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session per request."""
    with Session(engine) as session:
        yield session
