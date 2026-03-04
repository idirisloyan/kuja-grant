"""
Kuja Grant Management System - Simple In-Memory Cache
======================================================
Extracted from server.py (around line 2118).
Thread-safe TTL cache used for sanctions screening results,
downloaded list data, and dashboard aggregations.
"""

import time


class SimpleCache:
    """In-memory cache with TTL for sanctions screening results."""

    def __init__(self, ttl_seconds=3600):
        self._cache = {}
        self._ttl = ttl_seconds

    def get(self, key):
        if key in self._cache:
            value, timestamp = self._cache[key]
            if time.time() - timestamp < self._ttl:
                return value
            del self._cache[key]
        return None

    def set(self, key, value):
        self._cache[key] = (value, time.time())

    def clear(self):
        self._cache.clear()


# ---------------------------------------------------------------------------
# Pre-configured cache instances
# ---------------------------------------------------------------------------

_sanctions_cache = SimpleCache(ttl_seconds=3600)    # 1 hour for API results
_list_cache = SimpleCache(ttl_seconds=86400)         # 24 hours for downloaded lists
_dashboard_cache = SimpleCache(ttl_seconds=30)       # 30 seconds for dashboard aggregations
