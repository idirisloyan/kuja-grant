"""
Kuja Grant Management System - Rate Limiter
=============================================
Database-backed rate limiter shared across all Gunicorn workers.
Falls back to in-memory when no DB is available (e.g. unit tests).
"""

import time
import logging
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from threading import Lock

logger = logging.getLogger('kuja')


class RateLimiter:
    """In-memory rate limiter (single-process only, kept for tests/fallback)."""

    def __init__(self, max_attempts=5, window_seconds=300, lockout_seconds=900):
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self._attempts = defaultdict(list)
        self._lockouts = {}
        self._lock = Lock()

    def is_locked(self, key: str) -> bool:
        with self._lock:
            lockout_until = self._lockouts.get(key)
            if lockout_until and time.time() < lockout_until:
                return True
            elif lockout_until:
                del self._lockouts[key]
            return False

    def record_failure(self, key: str) -> int:
        """Record a failed attempt. Returns remaining attempts before lockout."""
        now = time.time()
        with self._lock:
            cutoff = now - self.window_seconds
            self._attempts[key] = [t for t in self._attempts[key] if t > cutoff]
            self._attempts[key].append(now)
            count = len(self._attempts[key])
            if count >= self.max_attempts:
                self._lockouts[key] = now + self.lockout_seconds
                self._attempts[key] = []
            return max(0, self.max_attempts - count)

    def reset(self, key: str):
        with self._lock:
            self._attempts.pop(key, None)
            self._lockouts.pop(key, None)

    def lockout_remaining(self, key: str) -> int:
        with self._lock:
            lockout_until = self._lockouts.get(key)
            if lockout_until:
                return max(0, int(lockout_until - time.time()))
            return 0


class DbRateLimiter:
    """Database-backed rate limiter shared across all Gunicorn workers.

    Uses the existing ``login_attempts`` table (ip column stores the
    limiter key, email column stores the limiter name for filtering).
    Falls back to in-memory RateLimiter if the DB is unavailable.
    """

    def __init__(self, name: str, max_attempts: int = 20,
                 window_seconds: int = 60, lockout_seconds: int = 60):
        self.name = name
        self.max_attempts = max_attempts
        self.window_seconds = window_seconds
        self.lockout_seconds = lockout_seconds
        self._fallback = RateLimiter(max_attempts, window_seconds, lockout_seconds)

    def _count(self, key: str) -> int:
        """Count recent attempts for *key* within the sliding window."""
        from app.extensions import db
        from sqlalchemy import text
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(seconds=self.window_seconds)
            row = db.session.execute(
                text("SELECT COUNT(*) FROM login_attempts "
                     "WHERE ip = :key AND email = :name AND attempted_at > :cutoff"),
                {"key": key, "name": self.name, "cutoff": cutoff},
            )
            return row.scalar() or 0
        except Exception as e:
            logger.debug(f"DbRateLimiter._count failed ({e}), using fallback")
            db.session.rollback()
            return -1  # signal fallback

    def is_locked(self, key: str) -> bool:
        count = self._count(key)
        if count < 0:
            return self._fallback.is_locked(key)
        return count >= self.max_attempts

    def record_failure(self, key: str) -> int:
        from app.extensions import db
        from sqlalchemy import text
        try:
            db.session.execute(
                text("INSERT INTO login_attempts (ip, email, attempted_at) "
                     "VALUES (:key, :name, :ts)"),
                {"key": key, "name": self.name,
                 "ts": datetime.now(timezone.utc)},
            )
            db.session.commit()

            # Prune old rows for this limiter (~2% of inserts)
            import random
            if random.random() < 0.02:
                cutoff = datetime.now(timezone.utc) - timedelta(
                    seconds=self.window_seconds * 3)
                db.session.execute(
                    text("DELETE FROM login_attempts "
                         "WHERE email = :name AND attempted_at < :cutoff"),
                    {"name": self.name, "cutoff": cutoff},
                )
                db.session.commit()

            count = self._count(key)
            if count < 0:
                return 0
            return max(0, self.max_attempts - count)
        except Exception as e:
            logger.debug(f"DbRateLimiter.record_failure failed ({e}), using fallback")
            db.session.rollback()
            return self._fallback.record_failure(key)

    def reset(self, key: str):
        from app.extensions import db
        from sqlalchemy import text
        try:
            db.session.execute(
                text("DELETE FROM login_attempts WHERE ip = :key AND email = :name"),
                {"key": key, "name": self.name},
            )
            db.session.commit()
        except Exception:
            db.session.rollback()
        self._fallback.reset(key)

    def lockout_remaining(self, key: str) -> int:
        """Approximate seconds remaining based on oldest relevant attempt."""
        from app.extensions import db
        from sqlalchemy import text
        try:
            cutoff = datetime.now(timezone.utc) - timedelta(seconds=self.window_seconds)
            row = db.session.execute(
                text("SELECT MIN(attempted_at) FROM login_attempts "
                     "WHERE ip = :key AND email = :name AND attempted_at > :cutoff"),
                {"key": key, "name": self.name, "cutoff": cutoff},
            )
            oldest = row.scalar()
            if oldest:
                if oldest.tzinfo is None:
                    oldest = oldest.replace(tzinfo=timezone.utc)
                expires = oldest + timedelta(seconds=self.window_seconds)
                remaining = (expires - datetime.now(timezone.utc)).total_seconds()
                return max(0, int(remaining))
            return 0
        except Exception:
            db.session.rollback()
            return self._fallback.lockout_remaining(key)


# ---------------------------------------------------------------------------
# Pre-configured limiter instances
# ---------------------------------------------------------------------------

# login_limiter is unused — login route uses its own DB-backed logic in auth.py
login_limiter = RateLimiter(max_attempts=5, window_seconds=300, lockout_seconds=900)

# ai_limiter: DB-backed, shared across all Gunicorn workers
ai_limiter = DbRateLimiter(name='__ai_limit__', max_attempts=20,
                           window_seconds=60, lockout_seconds=60)
