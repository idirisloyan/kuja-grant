"""
Kuja Grant Management System - Distributed Lock
=================================================
Provides a distributed lock mechanism to prevent duplicate re-screening runs
across multiple Gunicorn workers or horizontal instances.

Uses Redis-based locking when REDIS_URL is set, falling back to a file-based
lock at /tmp/kuja_rescreening.lock when Redis is unavailable.

The lock has a TTL of 1 hour to prevent stale locks from blocking future runs
if a worker crashes mid-execution.
"""

import logging
import os
import time

logger = logging.getLogger('kuja')

LOCK_KEY = 'kuja:rescreening:lock'
LOCK_TTL_SECONDS = 3600  # 1 hour
LOCK_FILE_PATH = '/tmp/kuja_rescreening.lock'

# ---------------------------------------------------------------------------
# Redis client (reuse from task_runner if available)
# ---------------------------------------------------------------------------
_redis_client = None

try:
    _redis_url = os.getenv('REDIS_URL', '')
    if _redis_url:
        import redis
        _redis_client = redis.from_url(_redis_url, decode_responses=True)
        _redis_client.ping()
        logger.info("Distributed lock: using Redis backend")
    else:
        logger.info("Distributed lock: using file-based backend (/tmp)")
except Exception as e:
    logger.warning(f"Distributed lock: Redis unavailable ({e}), using file-based fallback")
    _redis_client = None


def acquire_rescreening_lock() -> bool:
    """Acquire the distributed rescreening lock.

    Returns True if the lock was acquired, False if another worker holds it.
    The lock auto-expires after LOCK_TTL_SECONDS (1 hour).
    """
    # Try Redis first
    if _redis_client:
        try:
            # SET NX (set if not exists) with TTL — atomic operation
            acquired = _redis_client.set(
                LOCK_KEY,
                f"pid={os.getpid()},time={time.time()}",
                nx=True,
                ex=LOCK_TTL_SECONDS,
            )
            return bool(acquired)
        except Exception as e:
            logger.warning(f"Redis lock acquire failed ({e}), falling back to file lock")

    # File-based fallback
    return _acquire_file_lock()


def release_rescreening_lock():
    """Release the distributed rescreening lock.

    Safe to call even if the lock is not held — will be a no-op.
    """
    # Try Redis first
    if _redis_client:
        try:
            _redis_client.delete(LOCK_KEY)
            return
        except Exception as e:
            logger.warning(f"Redis lock release failed ({e}), falling back to file lock")

    # File-based fallback
    _release_file_lock()


def _acquire_file_lock() -> bool:
    """Acquire a file-based lock at /tmp/kuja_rescreening.lock.

    The lock file contains a timestamp. If the lock file exists but is older
    than LOCK_TTL_SECONDS, it is considered stale and can be overwritten.
    """
    try:
        if os.path.exists(LOCK_FILE_PATH):
            # Check if lock is stale (older than TTL)
            try:
                mtime = os.path.getmtime(LOCK_FILE_PATH)
                age = time.time() - mtime
                if age < LOCK_TTL_SECONDS:
                    return False  # Lock is still valid
                # Stale lock — remove it
                logger.info(
                    f"Distributed lock: removing stale file lock "
                    f"(age={int(age)}s, ttl={LOCK_TTL_SECONDS}s)"
                )
                os.remove(LOCK_FILE_PATH)
            except (OSError, ValueError):
                # If we can't read the lock file, try to remove it
                try:
                    os.remove(LOCK_FILE_PATH)
                except OSError:
                    return False

        # Create lock file
        with open(LOCK_FILE_PATH, 'w') as f:
            f.write(f"pid={os.getpid()},time={time.time()}")
        return True
    except OSError as e:
        logger.warning(f"File lock acquire failed: {e}")
        return False


def _release_file_lock():
    """Release the file-based lock."""
    try:
        if os.path.exists(LOCK_FILE_PATH):
            os.remove(LOCK_FILE_PATH)
    except OSError as e:
        logger.warning(f"File lock release failed: {e}")
