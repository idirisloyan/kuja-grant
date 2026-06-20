"""
Phase 101 — Synthetic monitor admin + cron endpoints.

  POST /api/admin/synthetic-monitor/run  — kick a sweep manually (admin)
  GET  /api/admin/synthetic-monitor       — list recent sweeps (admin)
  POST /api/cron/synthetic-monitor        — cron-triggered sweep + persist
                                            + admin notification on failure
"""

import logging
import os
from datetime import datetime, timedelta, timezone

from flask import Blueprint, jsonify, request, current_app
from flask_login import login_required, current_user

from app.extensions import db
from app.models.synthetic_monitor import SyntheticMonitorRun
from app.services.synthetic_monitor import (
    SyntheticMonitor, persist_run, notify_failures,
)

logger = logging.getLogger('kuja')

synthetic_monitor_bp = Blueprint('synthetic_monitor', __name__, url_prefix='/api')


def _check_cron_auth(req) -> bool:
    expected = os.environ.get('CRON_SECRET') or getattr(
        current_app, '_kuja_cron_fallback', None,
    )
    if not expected:
        return False
    auth = req.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        return auth[len('Bearer '):] == expected
    return False


@synthetic_monitor_bp.route('/admin/synthetic-monitor/run', methods=['POST'])
@login_required
def admin_run_now():
    if current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin only.'}), 403
    base_url = (request.json or {}).get('base_url') if request.is_json else None
    result = SyntheticMonitor.run(base_url=base_url)
    persist_run(result)
    notify_failures(result)
    return jsonify({'success': True, 'result': result.to_dict()})


@synthetic_monitor_bp.route('/admin/synthetic-monitor', methods=['GET'])
@login_required
def admin_list_runs():
    """Recent runs for the admin dashboard.

    Query:
      days = trailing window (default 7, clamp 1..30)
      limit = max rows returned (default 100)
    """
    if current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin only.'}), 403
    try:
        days = max(1, min(30, int(request.args.get('days', 7))))
    except ValueError:
        days = 7
    try:
        limit = max(1, min(500, int(request.args.get('limit', 100))))
    except ValueError:
        limit = 100

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    rows = (
        SyntheticMonitorRun.query
        .filter(SyntheticMonitorRun.started_at >= cutoff)
        .order_by(SyntheticMonitorRun.started_at.desc())
        .limit(limit)
        .all()
    )

    # Trend summary
    total_failures = sum(r.failures for r in rows)
    total_runs = len(rows)
    failed_runs = sum(1 for r in rows if r.failures > 0)
    avg_total_ms = (
        sum(r.total_ms for r in rows) // total_runs if total_runs else 0
    )

    # Per-probe failure rate over the window
    from collections import defaultdict
    probe_counts: dict[str, dict[str, int]] = defaultdict(lambda: {'runs': 0, 'fails': 0})
    for r in rows:
        for p in r.to_dict()['probes']:
            probe_counts[p['name']]['runs'] += 1
            if not p['ok']:
                probe_counts[p['name']]['fails'] += 1
    per_probe = sorted(
        [
            {
                'name': name,
                'runs': c['runs'],
                'fails': c['fails'],
                'failure_rate_pct': round(100 * c['fails'] / c['runs'], 1) if c['runs'] else 0.0,
            }
            for name, c in probe_counts.items()
        ],
        key=lambda x: -x['failure_rate_pct'],
    )

    return jsonify({
        'success': True,
        'window_days': days,
        'total_runs': total_runs,
        'failed_runs': failed_runs,
        'total_failures': total_failures,
        'avg_total_ms': avg_total_ms,
        'per_probe': per_probe,
        'runs': [r.to_dict() for r in rows],
    })


@synthetic_monitor_bp.route('/cron/synthetic-monitor', methods=['POST'])
def cron_run():
    """Cron-triggered sweep. Auth: Bearer CRON_SECRET."""
    if not _check_cron_auth(request):
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    result = SyntheticMonitor.run()
    persist_run(result)
    notify_failures(result)
    return jsonify({
        'success': True,
        'failures': result.failures,
        'slow_count': result.slow_count,
        'total_ms': result.total_ms,
    })
