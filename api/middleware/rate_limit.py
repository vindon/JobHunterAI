"""
rate_limit.py — In-memory rate limiter for agent run endpoints.

Tracks the timestamps of agent run starts per "user" (single localhost
user for this personal tool) and enforces a maximum of 3 runs per hour.
"""

from __future__ import annotations

import logging
import time
from collections import deque
from threading import Lock

from fastapi import HTTPException

log = logging.getLogger("JobHunterAI.api.rate_limit")

# ── Configuration ──────────────────────────────────────────────────────────────
MAX_RUNS_PER_HOUR: int = 3
WINDOW_SECONDS: int = 3600  # 1 hour


class RateLimiter:
    """
    Sliding-window rate limiter.

    Maintains a deque of UTC timestamps (float) for each "user" key.
    On every check, timestamps older than WINDOW_SECONDS are evicted first.
    """

    def __init__(
        self,
        max_runs: int = MAX_RUNS_PER_HOUR,
        window_secs: int = WINDOW_SECONDS,
    ) -> None:
        self._max_runs = max_runs
        self._window = window_secs
        self._timestamps: deque[float] = deque()
        self._lock = Lock()

    # ── Public API ────────────────────────────────────────────────────────────

    def check_rate_limit(self) -> None:
        """
        Check whether a new run is allowed.

        Raises HTTPException 429 with Retry-After header if the limit is
        exceeded.  Records a new timestamp if the call is allowed.
        """
        with self._lock:
            self._evict_old()
            if len(self._timestamps) >= self._max_runs:
                cooldown = self.get_cooldown_seconds()
                log.warning(
                    f"Rate limit exceeded ({self._max_runs} runs/hour). "
                    f"Cooldown: {cooldown:.0f}s"
                )
                raise HTTPException(
                    status_code=429,
                    detail=(
                        f"Rate limit exceeded: maximum {self._max_runs} runs per hour. "
                        f"Try again in {cooldown:.0f} seconds."
                    ),
                    headers={"Retry-After": str(int(cooldown))},
                )
            self._timestamps.append(time.time())

    def get_cooldown_seconds(self) -> float:
        """
        Return the number of seconds until the oldest run expires from the
        window (i.e. how long the caller must wait before a new run is
        permitted).  Returns 0.0 if a run is currently allowed.
        """
        with self._lock:
            self._evict_old()
            if len(self._timestamps) < self._max_runs:
                return 0.0
            oldest = self._timestamps[0]
            return max(0.0, oldest + self._window - time.time())

    def current_run_count(self) -> int:
        """Return how many runs have been recorded in the current window."""
        with self._lock:
            self._evict_old()
            return len(self._timestamps)

    # ── Private ───────────────────────────────────────────────────────────────

    def _evict_old(self) -> None:
        """Remove timestamps that have fallen outside the sliding window."""
        cutoff = time.time() - self._window
        while self._timestamps and self._timestamps[0] < cutoff:
            self._timestamps.popleft()


# ── Singleton used by all routes ───────────────────────────────────────────────
rate_limiter = RateLimiter()
