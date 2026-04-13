"""
Kuja Grant Management System - Durable Async Task Runner
=========================================================
Uses Redis-backed task storage when REDIS_URL is set (enterprise mode),
falling back to in-memory ThreadPoolExecutor for single-instance deploys.

Enterprise mode (REDIS_URL set):
  - Tasks survive process restarts (stored in Redis with 24h TTL)
  - Shared state across Gunicorn workers and horizontal instances
  - Configurable max_workers via TASK_RUNNER_WORKERS env var

Single-instance mode (no REDIS_URL):
  - In-memory dict + ThreadPoolExecutor (same as before)
  - Suitable for Railway single-instance or development

Usage:
    from app.services.task_runner import submit_task, get_task

    task_id = submit_task(my_func, arg1, arg2, task_type='ai_score')
    status  = get_task(task_id)  # {'id': '...', 'status': 'running'|'completed'|'failed', ...}
"""

import json
import logging
import os
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger('kuja')

# ---------------------------------------------------------------------------
# Task storage backend (Redis when available, in-memory fallback)
# ---------------------------------------------------------------------------
REDIS_URL = os.getenv('REDIS_URL', '')
MAX_WORKERS = int(os.getenv('TASK_RUNNER_WORKERS', '4'))
TASK_TTL_SECONDS = 24 * 3600  # 24 hours

_redis_client = None
_tasks: Dict[str, dict] = {}  # In-memory fallback

try:
    if REDIS_URL:
        import redis
        _redis_client = redis.from_url(REDIS_URL, decode_responses=True)
        _redis_client.ping()
        logger.info(f"Task runner: Redis-backed storage (workers={MAX_WORKERS})")
    else:
        logger.info(f"Task runner: in-memory storage (workers={MAX_WORKERS})")
except Exception as e:
    logger.warning(f"Task runner: Redis unavailable ({e}), using in-memory fallback")
    _redis_client = None

_executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix='kuja-task')

TASK_KEY_PREFIX = 'kuja:task:'


def _store_task(task_id: str, task: dict):
    """Store task state in Redis or memory."""
    if _redis_client:
        try:
            _redis_client.setex(
                f'{TASK_KEY_PREFIX}{task_id}',
                TASK_TTL_SECONDS,
                json.dumps(task),
            )
            return
        except Exception as e:
            logger.warning(f"Redis store failed for task {task_id}: {e}")
    _tasks[task_id] = task


def _load_task(task_id: str) -> Optional[dict]:
    """Load task state from Redis or memory."""
    if _redis_client:
        try:
            data = _redis_client.get(f'{TASK_KEY_PREFIX}{task_id}')
            if data:
                return json.loads(data)
            return None
        except Exception as e:
            logger.warning(f"Redis load failed for task {task_id}: {e}")
    return _tasks.get(task_id)


def submit_task(fn: Callable, *args, task_type: str = 'generic', **kwargs) -> str:
    """Submit a function to run in background. Returns task_id."""
    task_id = str(uuid.uuid4())[:8]
    task = {
        'id': task_id,
        'type': task_type,
        'status': 'running',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'result': None,
        'error': None,
    }
    _store_task(task_id, task)

    def _wrapper():
        try:
            result = fn(*args, **kwargs)
            task_data = _load_task(task_id) or task
            task_data['status'] = 'completed'
            task_data['result'] = result
            task_data['completed_at'] = datetime.now(timezone.utc).isoformat()
            _store_task(task_id, task_data)
            logger.info(f"Task {task_id} ({task_type}) completed")
        except Exception as e:
            task_data = _load_task(task_id) or task
            task_data['status'] = 'failed'
            task_data['error'] = str(e)
            task_data['completed_at'] = datetime.now(timezone.utc).isoformat()
            _store_task(task_id, task_data)
            logger.error(f"Task {task_id} ({task_type}) failed: {e}")

    _executor.submit(_wrapper)
    logger.info(f"Task {task_id} ({task_type}) submitted")
    return task_id


def get_task(task_id: str) -> Optional[dict]:
    """Get task status and result."""
    return _load_task(task_id)


def list_tasks(status: Optional[str] = None) -> list:
    """List all tasks, optionally filtered by status."""
    if _redis_client:
        try:
            keys = _redis_client.keys(f'{TASK_KEY_PREFIX}*')
            tasks = []
            for key in keys:
                data = _redis_client.get(key)
                if data:
                    tasks.append(json.loads(data))
        except Exception:
            tasks = list(_tasks.values())
    else:
        tasks = list(_tasks.values())
    if status:
        tasks = [t for t in tasks if t.get('status') == status]
    return sorted(tasks, key=lambda t: t.get('created_at', ''), reverse=True)


def cleanup_old_tasks(max_age_hours: int = 24):
    """Remove completed/failed tasks older than max_age_hours.
    Redis tasks auto-expire via TTL; this cleans the in-memory dict."""
    if _redis_client:
        return 0  # Redis TTL handles expiry
    now = datetime.now(timezone.utc)
    to_remove = []
    for tid, task in _tasks.items():
        if task['status'] in ('completed', 'failed'):
            created = datetime.fromisoformat(task['created_at'].replace('Z', '+00:00'))
            if (now - created).total_seconds() > max_age_hours * 3600:
                to_remove.append(tid)
    for tid in to_remove:
        del _tasks[tid]
    if to_remove:
        logger.info(f"Task cleanup: removed {len(to_remove)} old tasks")
    return len(to_remove)


def get_backend_info() -> dict:
    """Return info about the current task storage backend."""
    return {
        'backend': 'redis' if _redis_client else 'memory',
        'max_workers': MAX_WORKERS,
        'redis_url': bool(REDIS_URL),
    }
