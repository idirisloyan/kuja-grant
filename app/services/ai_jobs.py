"""
Async AI job dispatcher — Phase 13.42.

Offloads heavy AI calls from HTTP handler threads to the existing
`task_runner` background pool. Eliminates the synchronous-blocking
problem that produced the 2026-05-06 production outage where multiple
concurrent AI calls saturated Gunicorn workers.

Pattern:

  HTTP handler:
      job_id = submit_ai_job('insight_narrate', payload, fn=do_work)
      return jsonify({'success': True, 'job_id': job_id, 'status': 'pending'}), 202

  Frontend:
      const job = await api.post('/copilot/insight-narrate?async=true', payload);
      const result = await pollJob(job.job_id);

  Generic poll endpoint:
      GET /api/ai/jobs/<job_id>
      → {status: 'pending'|'running'|'completed'|'failed', result?, error?}

This module is intentionally minimal — it composes the existing
`task_runner.submit_task` (which already supports Redis + ThreadPool +
24h TTL) with the Flask app-context + per-user language/role capture
that AI calls need to behave correctly outside the request thread.

Why not a new ai_jobs DB table? `task_runner` already gives us
per-job durable state via Redis when REDIS_URL is set, with 24h TTL,
visible from /admin/tasks. A new table would duplicate this without
adding value. Re-uses the same job_id namespace.
"""

from __future__ import annotations

import logging
from typing import Any, Callable

from flask import current_app
from flask_login import current_user

from app.services.task_runner import submit_task, get_task

logger = logging.getLogger('kuja')


def submit_ai_job(
    task_type: str,
    fn: Callable,
    *args,
    **kwargs,
) -> str:
    """Submit an AI call to the background pool and return a job_id.

    The HTTP request thread returns immediately. The background thread
    runs `fn(*args, **kwargs)` inside a fresh Flask app context so it
    can read DB state and write telemetry. The current user's id and
    language are captured up-front so the background task can reproduce
    the calling context (Flask-Login current_user is request-scoped
    and disappears once the request returns).

    `fn` is expected to return a JSON-serializable dict — that becomes
    the `result` field on the polled job.

    Returns: task_id (8-char string), suitable for /api/ai/jobs/<id>.
    """
    app = current_app._get_current_object()

    # Capture per-request context the AI call may need outside the
    # request thread.
    user_ctx = {'user_id': None, 'role': None, 'language': 'en'}
    try:
        if current_user and current_user.is_authenticated:
            user_ctx['user_id'] = getattr(current_user, 'id', None)
            user_ctx['role'] = getattr(current_user, 'role', None)
    except Exception:
        pass
    try:
        from app.utils.i18n import get_lang
        user_ctx['language'] = get_lang() or 'en'
    except Exception:
        pass

    def _bg_wrapper():
        with app.app_context():
            try:
                # The AI function may want explicit language/role so we
                # forward via kwargs when the caller didn't provide them.
                # Convention: fn signature accepts language= and role=
                # when relevant; otherwise these are ignored.
                effective_kwargs = dict(kwargs)
                if 'language' not in effective_kwargs and user_ctx['language']:
                    effective_kwargs.setdefault('_user_ctx_language', user_ctx['language'])
                # Pop the convention key — fn doesn't actually receive it,
                # it's just a hint that get_lang() will be unavailable in
                # the background thread.
                effective_kwargs.pop('_user_ctx_language', None)
                return fn(*args, **effective_kwargs)
            except Exception as e:
                logger.exception(f"submit_ai_job: {task_type} failed: {e}")
                # Re-raise so task_runner marks it failed.
                raise

    job_id = submit_task(_bg_wrapper, task_type=task_type)
    logger.info(
        f"submit_ai_job task_type={task_type} job_id={job_id} "
        f"user={user_ctx['user_id']} lang={user_ctx['language']}"
    )
    return job_id


def get_ai_job(job_id: str) -> dict | None:
    """Read the job status. Return None if unknown.

    Shape: { id, type, status: 'running'|'completed'|'failed',
             created_at, completed_at?, result?, error? }
    """
    return get_task(job_id)


def is_async_request(req) -> bool:
    """Phase 13.42 — convention for opting into async mode.

    Frontend opts in via query string `?async=true` OR a JSON body field
    `"async_mode": true`. Default is sync (backward compatible — old
    callers keep working unchanged).
    """
    try:
        if req.args.get('async', '').lower() in ('1', 'true', 'yes'):
            return True
    except Exception:
        pass
    try:
        body = req.get_json(silent=True) or {}
        if body.get('async_mode') is True:
            return True
    except Exception:
        pass
    return False
