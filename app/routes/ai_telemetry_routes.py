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

# Phase 98.10 — AI quality telemetry. User-facing producer endpoints that
# every AI-touched form submits to. Read side stays under the existing admin
# rollup; producer side lives on a separate blueprint at /api/ai-telemetry
# so the frontend ai-quality.ts module's hardcoded paths resolve.
ai_quality_bp = Blueprint('ai_quality', __name__, url_prefix='/api/ai-telemetry')


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


# ---------------------------------------------------------------------------
# Phase 98.10 — AI quality (edit-distance + false-confidence)
# ---------------------------------------------------------------------------
#
# These two endpoints accept producer events from `lib/ai-quality.ts` on the
# frontend. The endpoints are intentionally lightweight: validate the payload
# shape, log it, and reuse the existing AICallLog table (with endpoint tag
# "ai-quality/<surface>") so the existing /api/admin/ai-telemetry rollup
# surface picks the events up automatically. We intentionally do not block
# the user on telemetry failure — bad input returns 200 + ignored=true.

@ai_quality_bp.route('/quality', methods=['POST'])
@login_required
def api_ai_quality():
    """Record an AI-quality event produced by recordAiQuality() on the client.

    Payload (best-effort; all fields optional, ignored if malformed):
      surface (str), mode ('verbatim'|'blended'|'rejected'),
      editDistanceWords (int), proposedWords (int), finalWords (int),
      editRatio (float 0..1), language (str), latencyMs (int),
      capturedAtISO (ISO timestamp).

    Returns 200 always so the producer's keepalive POST never errors —
    invalid events are silently dropped with ignored=true.
    """
    from flask import request as flask_request
    try:
        body = flask_request.get_json(silent=True) or {}
    except Exception:
        body = {}

    surface = str(body.get('surface') or '').strip()[:80]
    mode = str(body.get('mode') or '').strip()
    edit_ratio = body.get('editRatio')
    if not surface or mode not in ('verbatim', 'blended', 'rejected'):
        return jsonify({'success': True, 'ignored': True, 'reason': 'malformed'})

    # Reuse AICallLog to avoid adding a separate table. The endpoint tag
    # encodes the producer surface so the existing rollup groups events.
    try:
        log = AICallLog(
            endpoint=f'ai-quality/{surface}',
            success=True,
            user_id=current_user.id if current_user.is_authenticated else None,
            duration_ms=int(body.get('latencyMs') or 0) or None,
            tokens_out=int(body.get('finalWords') or 0) or None,
            error_code=mode,
            error_message=(
                f"editRatio={edit_ratio} "
                f"editDistanceWords={body.get('editDistanceWords')} "
                f"language={body.get('language') or 'n/a'}"
            )[:500],
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        logger.warning('ai-quality log failed: %s', e)
        db.session.rollback()
        return jsonify({'success': True, 'ignored': True, 'reason': 'log_failed'})

    return jsonify({'success': True})


@ai_quality_bp.route('/false-confidence', methods=['POST'])
@login_required
def api_ai_false_confidence():
    """Record a false-confidence event: AI was accepted verbatim but later
    corrected by a recipient (donor / reviewer / OB / system).

    This is the metric guardrail introduced in the Phase 98 design review:
    without it, the team optimises AI acceptance and ships confidently-wrong
    output. Pairs with /quality above.
    """
    from flask import request as flask_request
    try:
        body = flask_request.get_json(silent=True) or {}
    except Exception:
        body = {}

    surface = str(body.get('surface') or '').strip()[:80]
    item_id = str(body.get('itemId') or '').strip()[:64]
    corrected_by = str(body.get('correctedBy') or '').strip()
    if not surface or corrected_by not in ('donor', 'reviewer', 'ob', 'system'):
        return jsonify({'success': True, 'ignored': True, 'reason': 'malformed'})

    try:
        log = AICallLog(
            endpoint=f'ai-quality/{surface}/false-confidence',
            success=False,
            user_id=current_user.id if current_user.is_authenticated else None,
            error_code=corrected_by,
            error_message=f'item={item_id} corrected_by={corrected_by}'[:500],
        )
        db.session.add(log)
        db.session.commit()
    except Exception as e:
        logger.warning('ai-false-confidence log failed: %s', e)
        db.session.rollback()
        return jsonify({'success': True, 'ignored': True, 'reason': 'log_failed'})

    return jsonify({'success': True})
