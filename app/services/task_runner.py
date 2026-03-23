"""
Kuja Grant Management System - Lightweight Async Task Runner
=============================================================
Uses ThreadPoolExecutor for background processing of heavy AI/compliance
operations. Works with Gunicorn's gthread worker class (already configured).

For enterprise scale, swap for Celery + Redis.

Usage:
    from app.services.task_runner import submit_task, get_task

    task_id = submit_task(my_func, arg1, arg2, task_type='ai_score')
    status  = get_task(task_id)  # {'id': '...', 'status': 'running'|'completed'|'failed', ...}
"""

import logging
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Callable, Dict, Optional

logger = logging.getLogger('kuja')

# ---------------------------------------------------------------------------
# Task storage (in-memory, sufficient for single-instance Railway deployment)
# ---------------------------------------------------------------------------
_tasks: Dict[str, dict] = {}
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix='kuja-task')


def submit_task(fn: Callable, *args, task_type: str = 'generic', **kwargs) -> str:
    """Submit a function to run in background. Returns task_id."""
    task_id = str(uuid.uuid4())[:8]
    _tasks[task_id] = {
        'id': task_id,
        'type': task_type,
        'status': 'running',
        'created_at': datetime.now(timezone.utc).isoformat(),
        'result': None,
        'error': None,
    }

    def _wrapper():
        try:
            result = fn(*args, **kwargs)
            _tasks[task_id]['status'] = 'completed'
            _tasks[task_id]['result'] = result
            _tasks[task_id]['completed_at'] = datetime.now(timezone.utc).isoformat()
            logger.info(f"Task {task_id} ({task_type}) completed")
        except Exception as e:
            _tasks[task_id]['status'] = 'failed'
            _tasks[task_id]['error'] = str(e)
            _tasks[task_id]['completed_at'] = datetime.now(timezone.utc).isoformat()
            logger.error(f"Task {task_id} ({task_type}) failed: {e}")

    _executor.submit(_wrapper)
    logger.info(f"Task {task_id} ({task_type}) submitted")
    return task_id


def get_task(task_id: str) -> Optional[dict]:
    """Get task status and result."""
    return _tasks.get(task_id)


def list_tasks(status: Optional[str] = None) -> list:
    """List all tasks, optionally filtered by status."""
    tasks = list(_tasks.values())
    if status:
        tasks = [t for t in tasks if t['status'] == status]
    return sorted(tasks, key=lambda t: t['created_at'], reverse=True)


def cleanup_old_tasks(max_age_hours: int = 24):
    """Remove completed/failed tasks older than max_age_hours."""
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
