"""
Phase 97 — AI telemetry rollup for admins.

Reads AICallLog and returns per-endpoint failure rates + latency +
token usage over a configurable window. So the team can see which AI
features actually fail in production and prioritise the next fallback
investment based on data, not anecdote.

Auth: admin only.
"""

import logging
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from flask import Blueprint, jsonify, request
from flask_login import login_required, current_user

from app.extensions import db
from app.models import AICallLog

logger = logging.getLogger('kuja')

ai_telemetry_bp = Blueprint('ai_telemetry', __name__, url_prefix='/api/admin')


@ai_telemetry_bp.route('/ai-telemetry', methods=['GET'])
@login_required
def api_ai_telemetry():
    """Aggregate AI call telemetry over a configurable window.

    Query:
      hours = window size in hours (default 168 = 7 days)

    Returns: {
      window_hours, total_calls, total_failures, failure_rate_pct,
      by_endpoint: [{ endpoint, calls, failures, failure_rate_pct,
                      p50_ms, p95_ms, total_tokens_out }],
      recent_failures: [{ endpoint, error_code, error_message,
                          created_at }],
    }
    """
    if current_user.role != 'admin':
        return jsonify({'success': False, 'error': 'Admin only.'}), 403

    try:
        hours = int(request.args.get('hours', 168))
        hours = max(1, min(720, hours))  # clamp 1h..30d
    except ValueError:
        hours = 168

    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    rows = AICallLog.query.filter(AICallLog.created_at >= cutoff).all()

    total = len(rows)
    failures = sum(1 for r in rows if not r.success)
    by_ep = defaultdict(list)
    for r in rows:
        by_ep[r.endpoint or 'unknown'].append(r)

    def _pct(num, denom):
        return round(100 * num / denom, 1) if denom else 0.0

    def _percentile(values, pct):
        if not values:
            return None
        s = sorted(values)
        idx = min(len(s) - 1, int(len(s) * pct / 100))
        return s[idx]

    by_endpoint = []
    for ep, rs in by_ep.items():
        durs = [r.duration_ms for r in rs if r.duration_ms is not None]
        tok_out = sum(r.tokens_out or 0 for r in rs)
        ep_failures = sum(1 for r in rs if not r.success)
        by_endpoint.append({
            'endpoint': ep,
            'calls': len(rs),
            'failures': ep_failures,
            'failure_rate_pct': _pct(ep_failures, len(rs)),
            'p50_ms': _percentile(durs, 50),
            'p95_ms': _percentile(durs, 95),
            'total_tokens_out': tok_out,
        })
    # Sort by calls desc so the highest-traffic endpoints come first.
    by_endpoint.sort(key=lambda e: e['calls'], reverse=True)

    recent_failures = [
        {
            'endpoint': r.endpoint,
            'error_code': r.error_code,
            'error_message': (r.error_message or '')[:200],
            'duration_ms': r.duration_ms,
            'created_at': r.created_at.isoformat() if r.created_at else None,
        }
        for r in sorted(
            (r for r in rows if not r.success),
            key=lambda r: r.created_at, reverse=True,
        )[:20]
    ]

    return jsonify({
        'success': True,
        'window_hours': hours,
        'total_calls': total,
        'total_failures': failures,
        'failure_rate_pct': _pct(failures, total),
        'by_endpoint': by_endpoint,
        'recent_failures': recent_failures,
    })
