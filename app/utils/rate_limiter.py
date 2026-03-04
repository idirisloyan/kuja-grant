"""
Kuja Grant Management System - Rate Limiter
=============================================
Extracted from server.py lines 87-133.
Simple in-memory, thread-safe rate limiter used for login attempts
and AI call throttling.
"""

import time
from collections import defaultdict
from threading import Lock


class RateLimiter:
    """Simple in-memory rate limiter for login attempts."""

    def __init__(self, max_attempts=5, window_seconds=300, lockout_seconds=900):
        self.max_attempts = max_attempts       # max failures within window
        self.window_seconds = window_seconds   # 5-minute rolling window
        self.lockout_seconds = lockout_seconds  # 15-minute lockout after max failures
        self._attempts = defaultdict(list)     # key -> [timestamps]
        self._lockouts = {}                    # key -> lockout_until timestamp
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
        """Seconds remaining in lockout."""
        with self._lock:
            lockout_until = self._lockouts.get(key)
            if lockout_until:
                return max(0, int(lockout_until - time.time()))
            return 0


# ---------------------------------------------------------------------------
# Pre-configured limiter instances
# ---------------------------------------------------------------------------

login_limiter = RateLimiter(max_attempts=5, window_seconds=300, lockout_seconds=900)
ai_limiter = RateLimiter(max_attempts=20, window_seconds=60, lockout_seconds=60)
